import pytest

PROTECTED = [
    ("get", "/api/v1/deliveries"),
    ("get", "/api/v1/deliveries/1"),
    ("post", "/api/v1/deliveries/1/cancel"),
    ("get", "/api/v1/couriers"),
    ("get", "/api/v1/couriers/1"),
    ("patch", "/api/v1/couriers/1"),
]


@pytest.mark.parametrize(("method", "path"), PROTECTED)
async def test_route_without_token_returns_401(anonymous_client, method, path):
    response = await getattr(anonymous_client, method)(path)

    assert response.status_code == 401


@pytest.mark.parametrize(("method", "path"), PROTECTED)
async def test_route_with_garbage_token_returns_401(anonymous_client, method, path):
    response = await getattr(anonymous_client, method)(
        path, headers={"Authorization": "Bearer not-a-real-token"}
    )

    assert response.status_code == 401


async def test_creating_deliveries_and_couriers_requires_login(anonymous_client):
    assert (
        await anonymous_client.post("/api/v1/deliveries", json={})
    ).status_code == 401
    assert (await anonymous_client.post("/api/v1/couriers", json={})).status_code == 401


async def test_health_check_stays_public(anonymous_client):
    assert (await anonymous_client.get("/")).status_code == 200


async def test_logged_in_client_can_reach_protected_route(client):
    assert (await client.get("/api/v1/deliveries")).status_code == 200
