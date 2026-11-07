from datetime import timedelta

from sqlalchemy import select

from app.models.user import User, UserRole
from tests.helpers import bearer, forge_token, headers_for, make_user

NEW_USER = {
    "email": "newuser@example.com",
    "full_name": "New User",
    "password": "password123",
}


async def register(client, **overrides):
    return await client.post("/auth/register", json={**NEW_USER, **overrides})


async def login(client, email=NEW_USER["email"], password=NEW_USER["password"]):
    # Login is an OAuth2 form, not JSON, and the email goes in "username".
    return await client.post(
        "/auth/login", data={"username": email, "password": password}
    )


# --- Part A: registration and passwords -------------------------------------


async def test_register_creates_a_customer(anonymous_client):
    response = await register(anonymous_client)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == NEW_USER["email"]
    assert body["role"] == "customer"
    assert body["is_active"] is True


async def test_register_response_never_contains_the_password_or_hash(anonymous_client):
    body = (await register(anonymous_client)).json()

    assert "password" not in body
    assert "hashed_password" not in body


async def test_database_stores_a_hash_not_the_password(anonymous_client, db_session):
    await register(anonymous_client)

    user = await db_session.scalar(select(User).where(User.email == NEW_USER["email"]))

    assert user.hashed_password != NEW_USER["password"]
    assert user.hashed_password.startswith("$argon2")


async def test_duplicate_email_returns_409(anonymous_client):
    await register(anonymous_client)

    response = await register(anonymous_client)

    assert response.status_code == 409


async def test_register_cannot_choose_its_own_role(anonymous_client, db_session):
    response = await register(anonymous_client, role="admin")

    user = await db_session.scalar(select(User).where(User.email == NEW_USER["email"]))
    assert response.status_code == 201
    assert user.role == UserRole.CUSTOMER


async def test_register_rejects_a_bad_email(anonymous_client):
    assert (await register(anonymous_client, email="not-an-email")).status_code == 422


async def test_register_rejects_a_short_password(anonymous_client):
    assert (await register(anonymous_client, password="short")).status_code == 422


# --- Part A: login ----------------------------------------------------------


async def test_login_with_correct_password_returns_a_working_token(anonymous_client):
    await register(anonymous_client)

    response = await login(anonymous_client)

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    me = await anonymous_client.get("/auth/me", headers=bearer(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == NEW_USER["email"]


async def test_login_with_wrong_password_returns_401(anonymous_client):
    await register(anonymous_client)

    response = await login(anonymous_client, password="wrong-password")

    assert response.status_code == 401


async def test_login_with_unknown_email_gives_the_same_401(anonymous_client):
    await register(anonymous_client)

    wrong_password = await login(anonymous_client, password="wrong-password")
    unknown_email = await login(anonymous_client, email="nobody@example.com")

    # The two failures must look identical, or the API reveals which emails exist.
    assert unknown_email.status_code == 401
    assert unknown_email.json() == wrong_password.json()


async def test_inactive_user_cannot_log_in(anonymous_client, db_session):
    user = await register(anonymous_client)
    db_user = await db_session.get(User, user.json()["id"])
    db_user.is_active = False
    await db_session.flush()

    response = await login(anonymous_client)

    assert response.status_code == 401


# --- Parts B and C: tokens on a protected endpoint ---------------------------


async def test_me_with_valid_token(anonymous_client, db_session):
    user = await make_user(db_session, email="me@example.com")

    response = await anonymous_client.get("/auth/me", headers=headers_for(user))

    assert response.status_code == 200
    assert response.json()["email"] == "me@example.com"


async def test_me_without_token_returns_401(anonymous_client):
    assert (await anonymous_client.get("/auth/me")).status_code == 401


async def test_me_with_malformed_token_returns_401(anonymous_client):
    response = await anonymous_client.get("/auth/me", headers=bearer("garbage"))

    assert response.status_code == 401


async def test_me_with_expired_token_returns_401(anonymous_client, db_session):
    user = await make_user(db_session)
    token = forge_token(str(user.id), expires_in=timedelta(minutes=-1))

    response = await anonymous_client.get("/auth/me", headers=bearer(token))

    assert response.status_code == 401


async def test_me_with_wrong_signature_returns_401(anonymous_client, db_session):
    user = await make_user(db_session)
    token = forge_token(str(user.id), key="a-different-secret-key-of-32-bytes!!")

    response = await anonymous_client.get("/auth/me", headers=bearer(token))

    assert response.status_code == 401


async def test_me_with_token_missing_subject_returns_401(anonymous_client):
    response = await anonymous_client.get(
        "/auth/me", headers=bearer(forge_token(omit=("sub",)))
    )

    assert response.status_code == 401


async def test_me_with_non_numeric_subject_returns_401_not_500(anonymous_client):
    response = await anonymous_client.get(
        "/auth/me", headers=bearer(forge_token("not-a-number"))
    )

    assert response.status_code == 401


async def test_me_with_token_for_a_user_that_does_not_exist(anonymous_client):
    response = await anonymous_client.get(
        "/auth/me", headers=bearer(forge_token("999999"))
    )

    assert response.status_code == 401


async def test_me_with_token_of_an_inactive_user_returns_401(
    anonymous_client, db_session
):
    user = await make_user(db_session, is_active=False)

    response = await anonymous_client.get("/auth/me", headers=headers_for(user))

    assert response.status_code == 401


# --- Email handling and the JSON login ---------------------------------------


async def test_email_is_stored_in_lowercase(anonymous_client):
    response = await register(anonymous_client, email="NewUser@Example.COM")

    assert response.json()["email"] == "newuser@example.com"


async def test_same_email_in_a_different_case_is_a_duplicate(anonymous_client):
    await register(anonymous_client, email="newuser@example.com")

    response = await register(anonymous_client, email="NEWUSER@example.com")

    assert response.status_code == 409


async def test_login_ignores_email_case(anonymous_client):
    await register(anonymous_client)

    response = await login(anonymous_client, email="NewUser@EXAMPLE.com")

    assert response.status_code == 200


async def test_json_login_with_email_field(anonymous_client):
    await register(anonymous_client)

    response = await anonymous_client.post(
        "/auth/login/json",
        json={"email": NEW_USER["email"], "password": NEW_USER["password"]},
    )

    assert response.status_code == 200
    token = response.json()["access_token"]
    me = await anonymous_client.get("/auth/me", headers=bearer(token))
    assert me.json()["email"] == NEW_USER["email"]


async def test_json_login_with_wrong_password_returns_401(anonymous_client):
    await register(anonymous_client)

    response = await anonymous_client.post(
        "/auth/login/json",
        json={"email": NEW_USER["email"], "password": "wrong-password"},
    )

    assert response.status_code == 401


async def test_json_login_rejects_a_missing_email(anonymous_client):
    response = await anonymous_client.post(
        "/auth/login/json", json={"password": "password123"}
    )

    assert response.status_code == 422
