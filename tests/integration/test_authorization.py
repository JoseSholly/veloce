import pytest

from tests.helpers import (
    delivery_payload,
    headers_for,
    make_courier,
    make_delivery,
    make_user,
)

ADMIN_ONLY = [
    ("get", "/couriers"),
    ("get", "/couriers/1"),
    ("patch", "/couriers/1"),
]


# --- Roles: what kind of user are you? -------------------------------------


@pytest.mark.parametrize(("method", "path"), ADMIN_ONLY)
async def test_customer_cannot_use_courier_routes(client, method, path):
    response = await getattr(client, method)(path)

    assert response.status_code == 403


async def test_customer_cannot_create_a_courier(client):
    response = await client.post(
        "/couriers", json={"name": "Someone", "phone": "+2348012345678"}
    )

    assert response.status_code == 403


async def test_courier_user_cannot_use_courier_routes(anonymous_client, courier_user):
    response = await anonymous_client.get(
        "/couriers", headers=headers_for(courier_user)
    )

    assert response.status_code == 403


async def test_admin_can_use_courier_routes(admin_client):
    created = await admin_client.post(
        "/couriers", json={"name": "Someone", "phone": "+2348012345678"}
    )

    assert created.status_code == 201
    assert (await admin_client.get("/couriers")).status_code == 200


async def test_courier_user_cannot_create_or_cancel_deliveries(
    anonymous_client, db_session, customer, courier_user
):
    delivery = await make_delivery(db_session, customer)

    create = await anonymous_client.post(
        "/deliveries", json=delivery_payload(), headers=headers_for(courier_user)
    )
    cancel = await anonymous_client.post(
        f"/deliveries/{delivery.id}/cancel", headers=headers_for(courier_user)
    )

    assert create.status_code == 403
    assert cancel.status_code == 403


async def test_inactive_user_with_valid_token_is_rejected(anonymous_client, db_session):
    user = await make_user(db_session, email="gone@example.com", is_active=False)

    response = await anonymous_client.get("/deliveries", headers=headers_for(user))

    assert response.status_code == 401


# --- Assigning couriers: nobody picks their own courier ---------------------


async def test_customer_cannot_assign_a_courier(client, db_session, customer, courier):
    delivery = await make_delivery(db_session, customer)

    response = await client.post(
        f"/deliveries/{delivery.id}/assign", json={"courier_id": courier.id}
    )

    await db_session.refresh(courier)
    assert response.status_code == 403
    assert courier.available is True


async def test_courier_user_cannot_assign_a_courier(
    anonymous_client, db_session, customer, courier_user, courier
):
    delivery = await make_delivery(db_session, customer)

    response = await anonymous_client.post(
        f"/deliveries/{delivery.id}/assign",
        json={"courier_id": courier.id},
        headers=headers_for(courier_user),
    )

    assert response.status_code == 403


async def test_courier_id_in_the_create_body_is_ignored(client, db_session, courier):
    response = await client.post(
        "/deliveries", json=delivery_payload(courier_id=courier.id)
    )

    await db_session.refresh(courier)
    assert response.status_code == 201
    assert response.json()["courier_id"] is None
    assert response.json()["status"] == "pending"
    assert courier.available is True


# --- Ownership: is this yours? ---------------------------------------------


async def test_customer_cannot_see_another_customers_delivery(
    anonymous_client, db_session
):
    alice = await make_user(db_session, email="alice@example.com")
    bob = await make_user(db_session, email="bob@example.com")
    delivery = await make_delivery(db_session, alice)

    as_bob = await anonymous_client.get(
        f"/deliveries/{delivery.id}", headers=headers_for(bob)
    )
    as_alice = await anonymous_client.get(
        f"/deliveries/{delivery.id}", headers=headers_for(alice)
    )

    assert as_bob.status_code == 404
    assert as_alice.status_code == 200


async def test_customer_list_only_contains_own_deliveries(anonymous_client, db_session):
    alice = await make_user(db_session, email="alice@example.com")
    bob = await make_user(db_session, email="bob@example.com")
    await make_delivery(db_session, alice)
    await make_delivery(db_session, bob)

    response = await anonymous_client.get("/deliveries", headers=headers_for(alice))

    assert response.json()["total"] == 1


async def test_other_customer_cannot_cancel_and_courier_stays_busy(
    anonymous_client, db_session, courier
):
    alice = await make_user(db_session, email="alice@example.com")
    bob = await make_user(db_session, email="bob@example.com")
    delivery = await make_delivery(db_session, alice, courier=courier)
    # Settle the setup: a failing service call rolls back to the last commit.
    await db_session.commit()

    response = await anonymous_client.post(
        f"/deliveries/{delivery.id}/cancel", headers=headers_for(bob)
    )

    await db_session.refresh(courier)
    assert response.status_code == 404
    assert courier.available is False


async def test_a_customer_id_in_the_body_cannot_impersonate_another_user(
    anonymous_client, db_session
):
    alice = await make_user(db_session, email="alice@example.com")
    bob = await make_user(db_session, email="bob@example.com")

    created = await anonymous_client.post(
        "/deliveries",
        json=delivery_payload(customer_id=bob.id),
        headers=headers_for(alice),
    )

    delivery_id = created.json()["id"]
    as_alice = await anonymous_client.get(
        f"/deliveries/{delivery_id}", headers=headers_for(alice)
    )
    as_bob = await anonymous_client.get(
        f"/deliveries/{delivery_id}", headers=headers_for(bob)
    )
    assert created.status_code == 201
    assert as_alice.status_code == 200  # owned by the token's user
    assert as_bob.status_code == 404  # not by the id in the body


async def test_admin_sees_every_delivery(anonymous_client, db_session, admin_user):
    alice = await make_user(db_session, email="alice@example.com")
    bob = await make_user(db_session, email="bob@example.com")
    await make_delivery(db_session, alice)
    await make_delivery(db_session, bob)

    response = await anonymous_client.get(
        "/deliveries", headers=headers_for(admin_user)
    )

    assert response.json()["total"] == 2


# --- Couriers: only your own assigned deliveries ----------------------------


async def test_courier_a_can_access_their_own_delivery(
    anonymous_client, db_session, customer, courier_user
):
    profile = await make_courier(db_session, user_id=courier_user.id)
    delivery = await make_delivery(db_session, customer, courier=profile)

    response = await anonymous_client.get(
        f"/deliveries/{delivery.id}", headers=headers_for(courier_user)
    )

    assert response.status_code == 200
    assert response.json()["id"] == delivery.id


async def test_courier_a_cannot_access_courier_bs_delivery(
    anonymous_client, db_session, customer, courier_user
):
    await make_courier(db_session, user_id=courier_user.id)
    courier_b_user = await make_user(
        db_session, email="courier-b@example.com", role=courier_user.role
    )
    profile_b = await make_courier(db_session, user_id=courier_b_user.id)
    delivery_for_b = await make_delivery(db_session, customer, courier=profile_b)

    response = await anonymous_client.get(
        f"/deliveries/{delivery_for_b.id}", headers=headers_for(courier_user)
    )

    assert response.status_code == 404


async def test_courier_list_only_contains_assigned_deliveries(
    anonymous_client, db_session, customer, courier_user
):
    profile = await make_courier(db_session, user_id=courier_user.id)
    mine = await make_delivery(db_session, customer, courier=profile)
    await make_delivery(db_session, customer)

    response = await anonymous_client.get(
        "/deliveries", headers=headers_for(courier_user)
    )

    assert response.json()["total"] == 1
    assert response.json()["items"][0]["id"] == mine.id


# --- Unauthenticated --------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/deliveries/1"),
        ("post", "/deliveries/1/cancel"),
        ("post", "/deliveries/1/assign"),
    ],
)
async def test_unauthenticated_requests_return_401(anonymous_client, method, path):
    assert (await getattr(anonymous_client, method)(path)).status_code == 401
