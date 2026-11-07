from tests.helpers import delivery_payload, headers_for, make_delivery


async def test_create_delivery_is_pending_and_unassigned(client, customer):
    response = await client.post("/deliveries", json=delivery_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["courier_id"] is None
    assert body["pickup"]["city"] == "Lagos"


async def test_invalid_latitude_returns_422(client):
    payload = delivery_payload()
    payload["pickup"]["latitude"] = 123

    response = await client.post("/deliveries", json=payload)

    assert response.status_code == 422


async def test_get_delivery(client):
    created = (await client.post("/deliveries", json=delivery_payload())).json()

    response = await client.get(f"/deliveries/{created['id']}")

    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


async def test_get_missing_delivery_returns_404(client):
    assert (await client.get("/deliveries/9999")).status_code == 404


async def test_list_deliveries_paginates(client):
    for _ in range(3):
        await client.post("/deliveries", json=delivery_payload())

    response = await client.get("/deliveries", params={"page": 1, "page_size": 2})

    body = response.json()
    assert response.status_code == 200
    assert body["total"] == 3
    assert len(body["items"]) == 2


async def test_list_deliveries_rejects_bad_page_size(client):
    response = await client.get("/deliveries", params={"page_size": 0})

    assert response.status_code == 422


async def test_cancel_releases_courier_and_second_cancel_conflicts(
    client, db_session, customer, courier
):
    delivery = await make_delivery(db_session, customer, courier=courier)

    first = await client.post(f"/deliveries/{delivery.id}/cancel")
    second = await client.post(f"/deliveries/{delivery.id}/cancel")

    await db_session.refresh(courier)
    assert first.status_code == 200
    assert first.json()["status"] == "cancelled"
    assert courier.available is True
    assert second.status_code == 409


async def test_cancel_missing_delivery_returns_404(client):
    assert (await client.post("/deliveries/9999/cancel")).status_code == 404


# --- Assigning a courier (admin only) ---------------------------------------


async def test_admin_assigns_a_courier(
    anonymous_client, db_session, customer, admin_user, courier
):
    delivery = await make_delivery(db_session, customer)

    response = await anonymous_client.post(
        f"/deliveries/{delivery.id}/assign",
        json={"courier_id": courier.id},
        headers=headers_for(admin_user),
    )

    await db_session.refresh(courier)
    assert response.status_code == 200
    assert response.json()["status"] == "assigned"
    assert response.json()["courier_id"] == courier.id
    assert courier.available is False


async def test_assign_unknown_courier_returns_404(
    anonymous_client, db_session, customer, admin_user
):
    delivery = await make_delivery(db_session, customer)

    response = await anonymous_client.post(
        f"/deliveries/{delivery.id}/assign",
        json={"courier_id": 9999},
        headers=headers_for(admin_user),
    )

    assert response.status_code == 404


async def test_assign_busy_courier_returns_409(
    anonymous_client, db_session, customer, admin_user, courier
):
    await make_delivery(db_session, customer, courier=courier)
    second = await make_delivery(db_session, customer)

    response = await anonymous_client.post(
        f"/deliveries/{second.id}/assign",
        json={"courier_id": courier.id},
        headers=headers_for(admin_user),
    )

    assert response.status_code == 409


async def test_assign_twice_returns_409(
    anonymous_client, db_session, customer, admin_user, courier
):
    delivery = await make_delivery(db_session, customer)
    url = f"/deliveries/{delivery.id}/assign"
    headers = headers_for(admin_user)

    first = await anonymous_client.post(
        url, json={"courier_id": courier.id}, headers=headers
    )
    second = await anonymous_client.post(
        url, json={"courier_id": courier.id}, headers=headers
    )

    assert first.status_code == 200
    assert second.status_code == 409


async def test_assign_missing_body_returns_422(
    anonymous_client, db_session, customer, admin_user
):
    delivery = await make_delivery(db_session, customer)

    response = await anonymous_client.post(
        f"/deliveries/{delivery.id}/assign",
        json={},
        headers=headers_for(admin_user),
    )

    assert response.status_code == 422
