from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_refresh_token
from app.models.refresh_token import RefreshToken
from app.models.user import User
from tests.helpers import bearer

NEW_USER = {
    "email": "newuser@example.com",
    "full_name": "New User",
    "password": "password123",
}


async def sign_in(client, email: str = NEW_USER["email"]) -> dict:
    """Register (if needed) and log in. Returns the token response body."""
    await client.post("/auth/register", json={**NEW_USER, "email": email})
    response = await client.post(
        "/auth/login/json", json={"email": email, "password": NEW_USER["password"]}
    )
    return response.json()


async def refresh(client, refresh_token: str):
    return await client.post("/auth/refresh", json={"refresh_token": refresh_token})


async def logout(client, refresh_token: str):
    return await client.post("/auth/logout", json={"refresh_token": refresh_token})


async def stored_tokens(db_session) -> list[RefreshToken]:
    result = await db_session.execute(select(RefreshToken).order_by(RefreshToken.id))
    return list(result.scalars().all())


# --- Login hands out a refresh token ----------------------------------------


async def test_json_login_returns_a_refresh_token(anonymous_client):
    body = await sign_in(anonymous_client)

    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]


async def test_form_login_returns_a_refresh_token(anonymous_client):
    await anonymous_client.post("/auth/register", json=NEW_USER)

    response = await anonymous_client.post(
        "/auth/login",
        data={"username": NEW_USER["email"], "password": NEW_USER["password"]},
    )

    assert response.status_code == 200
    assert response.json()["refresh_token"]


async def test_failed_login_creates_no_refresh_token(anonymous_client, db_session):
    await anonymous_client.post("/auth/register", json=NEW_USER)

    await anonymous_client.post(
        "/auth/login/json",
        json={"email": NEW_USER["email"], "password": "wrong-password"},
    )

    assert await stored_tokens(db_session) == []


async def test_database_stores_only_a_hash_of_the_refresh_token(
    anonymous_client, db_session
):
    tokens = await sign_in(anonymous_client)

    (row,) = await stored_tokens(db_session)

    assert row.token_hash == hash_refresh_token(tokens["refresh_token"])
    assert tokens["refresh_token"] not in (row.token_hash, row.family_id)


async def test_refresh_token_expires_after_the_configured_number_of_days(
    anonymous_client, db_session
):
    await sign_in(anonymous_client)

    (row,) = await stored_tokens(db_session)

    expected = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    assert abs(row.expires_at - expected) < timedelta(minutes=1)


# --- Refreshing -------------------------------------------------------------


async def test_refresh_returns_a_new_working_pair(anonymous_client):
    first = await sign_in(anonymous_client)

    response = await refresh(anonymous_client, first["refresh_token"])

    assert response.status_code == 200
    second = response.json()
    assert second["refresh_token"] != first["refresh_token"]
    me = await anonymous_client.get("/auth/me", headers=bearer(second["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == NEW_USER["email"]


async def test_refresh_retires_the_old_token_and_keeps_the_family(
    anonymous_client, db_session
):
    first = await sign_in(anonymous_client)

    await refresh(anonymous_client, first["refresh_token"])

    old, new = await stored_tokens(db_session)
    assert old.revoked_at is not None
    assert new.revoked_at is None
    assert old.family_id == new.family_id


async def test_a_refresh_token_works_only_once(anonymous_client):
    first = await sign_in(anonymous_client)

    assert (await refresh(anonymous_client, first["refresh_token"])).status_code == 200
    second_try = await refresh(anonymous_client, first["refresh_token"])

    assert second_try.status_code == 401


async def test_the_chain_can_be_followed_many_times(anonymous_client):
    tokens = await sign_in(anonymous_client)

    for _ in range(3):
        response = await refresh(anonymous_client, tokens["refresh_token"])
        assert response.status_code == 200
        tokens = response.json()


async def test_reusing_a_retired_token_revokes_the_whole_session(
    anonymous_client, db_session
):
    first = await sign_in(anonymous_client)
    second = (await refresh(anonymous_client, first["refresh_token"])).json()

    # Someone presents the retired token: it was copied, so end the session.
    stolen_use = await refresh(anonymous_client, first["refresh_token"])
    legitimate_use = await refresh(anonymous_client, second["refresh_token"])

    assert stolen_use.status_code == 401
    assert legitimate_use.status_code == 401
    assert all(row.revoked_at is not None for row in await stored_tokens(db_session))


async def test_reuse_only_ends_that_session_not_the_others(anonymous_client):
    first_session = await sign_in(anonymous_client)
    other_session = (
        await anonymous_client.post(
            "/auth/login/json",
            json={"email": NEW_USER["email"], "password": NEW_USER["password"]},
        )
    ).json()
    await refresh(anonymous_client, first_session["refresh_token"])

    await refresh(anonymous_client, first_session["refresh_token"])  # reuse

    assert (
        await refresh(anonymous_client, other_session["refresh_token"])
    ).status_code == 200


async def test_unknown_refresh_token_returns_401(anonymous_client):
    response = await refresh(anonymous_client, "not-a-real-token")

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_refresh_without_a_token_returns_422(anonymous_client):
    assert (await anonymous_client.post("/auth/refresh", json={})).status_code == 422
    assert (await refresh(anonymous_client, "")).status_code == 422


async def test_expired_refresh_token_returns_401(anonymous_client, db_session):
    tokens = await sign_in(anonymous_client)
    (row,) = await stored_tokens(db_session)
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.commit()

    response = await refresh(anonymous_client, tokens["refresh_token"])

    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()


async def test_inactive_user_cannot_refresh(anonymous_client, db_session):
    tokens = await sign_in(anonymous_client)
    user = await db_session.scalar(select(User).where(User.email == NEW_USER["email"]))
    user.is_active = False
    await db_session.commit()

    response = await refresh(anonymous_client, tokens["refresh_token"])

    assert response.status_code == 401
    assert all(row.revoked_at is not None for row in await stored_tokens(db_session))


async def test_an_access_token_is_not_accepted_as_a_refresh_token(anonymous_client):
    tokens = await sign_in(anonymous_client)

    response = await refresh(anonymous_client, tokens["access_token"])

    assert response.status_code == 401


async def test_a_refresh_token_is_not_accepted_as_an_access_token(anonymous_client):
    tokens = await sign_in(anonymous_client)

    response = await anonymous_client.get(
        "/auth/me", headers=bearer(tokens["refresh_token"])
    )

    assert response.status_code == 401


# --- Logging out ------------------------------------------------------------


async def test_logout_ends_the_session(anonymous_client):
    tokens = await sign_in(anonymous_client)

    response = await logout(anonymous_client, tokens["refresh_token"])

    assert response.status_code == 204
    assert (await refresh(anonymous_client, tokens["refresh_token"])).status_code == 401


async def test_logout_ends_the_latest_token_of_a_rotated_session(anonymous_client):
    first = await sign_in(anonymous_client)
    second = (await refresh(anonymous_client, first["refresh_token"])).json()

    await logout(anonymous_client, second["refresh_token"])

    assert (await refresh(anonymous_client, second["refresh_token"])).status_code == 401


async def test_logout_is_safe_to_repeat_and_ignores_unknown_tokens(anonymous_client):
    tokens = await sign_in(anonymous_client)

    assert (await logout(anonymous_client, tokens["refresh_token"])).status_code == 204
    assert (await logout(anonymous_client, tokens["refresh_token"])).status_code == 204
    assert (await logout(anonymous_client, "not-a-real-token")).status_code == 204


async def test_logout_only_ends_that_session(anonymous_client):
    laptop = await sign_in(anonymous_client)
    phone = (
        await anonymous_client.post(
            "/auth/login/json",
            json={"email": NEW_USER["email"], "password": NEW_USER["password"]},
        )
    ).json()

    await logout(anonymous_client, laptop["refresh_token"])

    assert (await refresh(anonymous_client, laptop["refresh_token"])).status_code == 401
    assert (await refresh(anonymous_client, phone["refresh_token"])).status_code == 200


async def test_logout_all_ends_every_session(anonymous_client):
    laptop = await sign_in(anonymous_client)
    phone = (
        await anonymous_client.post(
            "/auth/login/json",
            json={"email": NEW_USER["email"], "password": NEW_USER["password"]},
        )
    ).json()

    response = await anonymous_client.post(
        "/auth/logout-all", headers=bearer(laptop["access_token"])
    )

    assert response.status_code == 204
    assert (await refresh(anonymous_client, laptop["refresh_token"])).status_code == 401
    assert (await refresh(anonymous_client, phone["refresh_token"])).status_code == 401


async def test_logout_all_leaves_other_users_alone(anonymous_client):
    mine = await sign_in(anonymous_client)
    theirs = await sign_in(anonymous_client, email="other@example.com")

    await anonymous_client.post(
        "/auth/logout-all", headers=bearer(mine["access_token"])
    )

    assert (await refresh(anonymous_client, theirs["refresh_token"])).status_code == 200


async def test_logout_all_requires_a_login(anonymous_client):
    assert (await anonymous_client.post("/auth/logout-all")).status_code == 401
