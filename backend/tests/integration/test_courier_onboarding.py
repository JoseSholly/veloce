"""An admin onboards a courier; the courier signs in and replaces the temporary password."""

import pytest
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from app.models.courier import Courier
from app.models.user import User
from tests.helpers import bearer, delivery_payload, make_courier

NEW_COURIER = {
    "name": "Ada Obi",
    "email": "Ada.Obi@Example.com",
    "phone": "+2348012345678",
}


async def onboard(admin_client) -> dict:
    response = await admin_client.post("/api/v1/couriers", json=NEW_COURIER)
    assert response.status_code == 201, response.text
    return response.json()


async def login(client, email: str, password: str):
    return await client.post(
        "/api/v1/auth/login/json", json={"email": email, "password": password}
    )


async def test_onboarding_creates_a_linked_account(admin_client):
    body = await onboard(admin_client)

    assert body["code"].startswith("VEL-COU-")
    assert body["email"] == "ada.obi@example.com"  # normalized
    assert len(body["temporary_password"]) == 12


async def test_the_temporary_password_is_shown_only_once(admin_client):
    created = await onboard(admin_client)

    again = (await admin_client.get(f"/api/v1/couriers/{created['id']}")).json()

    assert "temporary_password" not in again


async def test_a_new_courier_must_change_the_password_first(
    admin_client, anonymous_client
):
    created = await onboard(admin_client)

    tokens = (
        await login(anonymous_client, created["email"], created["temporary_password"])
    ).json()
    me = await anonymous_client.get(
        "/api/v1/auth/me", headers=bearer(tokens["access_token"])
    )
    blocked = await anonymous_client.get(
        "/api/v1/deliveries", headers=bearer(tokens["access_token"])
    )

    assert me.status_code == 200
    assert me.json()["must_change_password"] is True
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "password_change_required"


async def test_changing_the_password_unlocks_the_account(
    admin_client, anonymous_client
):
    created = await onboard(admin_client)
    old = (
        await login(anonymous_client, created["email"], created["temporary_password"])
    ).json()

    response = await anonymous_client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": created["temporary_password"],
            "new_password": "my-own-password",
        },
        headers=bearer(old["access_token"]),
    )

    assert response.status_code == 200
    new = response.json()
    unlocked = await anonymous_client.get(
        "/api/v1/deliveries", headers=bearer(new["access_token"])
    )
    assert unlocked.status_code == 200
    me = (
        await anonymous_client.get(
            "/api/v1/auth/me", headers=bearer(new["access_token"])
        )
    ).json()
    assert me["must_change_password"] is False

    # The temporary password and the old session are both finished.
    assert (
        await login(anonymous_client, created["email"], created["temporary_password"])
    ).status_code == 401
    stale = await anonymous_client.post(
        "/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]}
    )
    assert stale.status_code == 401
    assert (
        await login(anonymous_client, created["email"], "my-own-password")
    ).status_code == 200


@pytest.mark.parametrize(
    ("current", "new", "message"),
    [
        ("wrong-password", "my-own-password", "Current password is incorrect"),
        (None, None, "Choose a password different from the current one"),
    ],
)
async def test_change_password_rejects_bad_input(
    admin_client, anonymous_client, current, new, message
):
    created = await onboard(admin_client)
    temporary = created["temporary_password"]
    tokens = (await login(anonymous_client, created["email"], temporary)).json()

    response = await anonymous_client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": current or temporary,
            "new_password": new or temporary,
        },
        headers=bearer(tokens["access_token"]),
    )

    # 400, not 401: a 401 would make clients think the session ended.
    assert response.status_code == 400
    assert response.json()["error"]["message"] == message


async def test_an_email_can_only_be_used_once(admin_client):
    await onboard(admin_client)

    again = await admin_client.post("/api/v1/couriers", json=NEW_COURIER)

    assert again.status_code == 409
    assert again.json()["error"]["message"] == "Email already registered"


async def test_an_onboarded_courier_sees_deliveries_assigned_to_them(
    admin_client, anonymous_client
):
    created = await onboard(admin_client)
    delivery = (
        await admin_client.post("/api/v1/deliveries", json=delivery_payload())
    ).json()
    await admin_client.post(
        f"/api/v1/deliveries/{delivery['id']}/assign",
        json={"courier_id": created["id"]},
    )

    old = (
        await login(anonymous_client, created["email"], created["temporary_password"])
    ).json()
    new = (
        await anonymous_client.post(
            "/api/v1/auth/change-password",
            json={
                "current_password": created["temporary_password"],
                "new_password": "my-own-password",
            },
            headers=bearer(old["access_token"]),
        )
    ).json()
    visible = (
        await anonymous_client.get(
            "/api/v1/deliveries", headers=bearer(new["access_token"])
        )
    ).json()

    assert [item["code"] for item in visible["items"]] == [delivery["code"]]


async def test_the_database_refuses_a_courier_without_an_account(db_session):
    db_session.add(Courier(name="Orphan", phone="+2348012345678", available=True))

    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_an_account_with_a_courier_profile_cannot_be_deleted(db_session):
    courier = await make_courier(db_session)

    with pytest.raises(IntegrityError):
        await db_session.execute(delete(User).where(User.id == courier.user_id))
