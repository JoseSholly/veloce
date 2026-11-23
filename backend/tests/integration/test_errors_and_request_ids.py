import json
import logging

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.errors import install_error_handlers
from app.core.logging import JsonFormatter, RequestIdFilter, request_id_var
from app.core.middleware import RequestIdMiddleware


async def test_every_response_gets_a_request_id(anonymous_client):
    response = await anonymous_client.get("/health/live")

    request_id = response.headers["X-Request-ID"]
    assert len(request_id) == 32


async def test_a_safe_incoming_request_id_is_reused(anonymous_client):
    response = await anonymous_client.get(
        "/health/live", headers={"X-Request-ID": "trace-abc.123"}
    )

    assert response.headers["X-Request-ID"] == "trace-abc.123"


async def test_an_unsafe_incoming_request_id_is_replaced(anonymous_client):
    for bad in ("has spaces", "x" * 200, "semi;colon"):
        response = await anonymous_client.get(
            "/health/live", headers={"X-Request-ID": bad}
        )
        assert response.headers["X-Request-ID"] != bad


async def test_not_found_uses_the_error_shape(anonymous_client):
    response = await anonymous_client.get("/api/v1/no-such-thing")

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "not_found",
            "message": "Not Found",
            "request_id": response.headers["X-Request-ID"],
        }
    }


async def test_service_not_found_uses_the_error_shape(client):
    response = await client.get("/api/v1/deliveries/999999")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert response.json()["error"]["message"] == "Delivery not found"


async def test_unauthorized_keeps_the_bearer_challenge(anonymous_client):
    response = await anonymous_client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
    assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_validation_errors_name_each_field(anonymous_client):
    response = await anonymous_client.post(
        "/api/v1/auth/register",
        json={"email": "not-an-email", "full_name": "A", "password": "x"},
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert "email" in {detail["field"] for detail in error["details"]}


async def test_an_unexpected_error_hides_internals_but_keeps_the_request_id():
    # A tiny app with the same middleware and handlers, and a route that crashes.
    app = FastAPI()
    app.add_middleware(RequestIdMiddleware)
    install_error_handlers(app)

    @app.get("/boom")
    async def boom():
        raise RuntimeError("secret connection string")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/boom")

    assert response.status_code == 500
    error = response.json()["error"]
    assert error["code"] == "internal_error"
    assert "secret" not in response.text
    assert error["request_id"] == response.headers["X-Request-ID"]


def test_json_log_lines_carry_the_request_id_and_extra_fields():
    record = logging.LogRecord("app", logging.INFO, __file__, 1, "hello", None, None)
    record.duration_ms = 12.5

    token = request_id_var.set("req-1")
    try:
        RequestIdFilter().filter(record)
    finally:
        request_id_var.reset(token)

    line = json.loads(JsonFormatter().format(record))
    assert line["message"] == "hello"
    assert line["request_id"] == "req-1"
    assert line["duration_ms"] == 12.5
    assert line["level"] == "INFO"
