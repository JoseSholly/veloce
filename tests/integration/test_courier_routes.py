COURIER = {"name": "Test Courier", "phone": "+2348012345678"}


async def test_create_courier(admin_client):
    response = await admin_client.post("/couriers", json=COURIER)

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Test Courier"
    assert body["available"] is True


async def test_create_courier_with_short_phone_returns_422(admin_client):
    response = await admin_client.post("/couriers", json={**COURIER, "phone": "123"})

    assert response.status_code == 422


async def test_get_courier(admin_client):
    created = (await admin_client.post("/couriers", json=COURIER)).json()

    response = await admin_client.get(f"/couriers/{created['id']}")

    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


async def test_get_missing_courier_returns_404(admin_client):
    assert (await admin_client.get("/couriers/9999")).status_code == 404


async def test_list_couriers_filters_by_availability(
    admin_client, courier, unavailable_courier
):
    response = await admin_client.get("/couriers", params={"available": True})

    ids = [item["id"] for item in response.json()]
    assert courier.id in ids
    assert unavailable_courier.id not in ids


async def test_patch_courier_changes_only_sent_fields(admin_client):
    created = (await admin_client.post("/couriers", json=COURIER)).json()

    response = await admin_client.patch(
        f"/couriers/{created['id']}", json={"name": "New Name"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "New Name"
    assert body["phone"] == COURIER["phone"]


async def test_patch_missing_courier_returns_404(admin_client):
    response = await admin_client.patch("/couriers/9999", json={"name": "Whoever"})

    assert response.status_code == 404
