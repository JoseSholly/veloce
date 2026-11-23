import asyncio

import pytest
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core import database
from app.core.config import settings
from app.infrastructure import redis as redis_infra
from app.routers import health


async def _ok() -> None:
    return None


@pytest.fixture
def healthy(monkeypatch):
    """Both dependencies answer. Tests then break one at a time."""
    monkeypatch.setitem(health.CHECKS, "database", _ok)
    monkeypatch.setitem(health.CHECKS, "redis", _ok)


async def test_live_needs_no_dependencies(anonymous_client, monkeypatch):
    async def broken() -> None:
        raise ConnectionError

    monkeypatch.setitem(health.CHECKS, "database", broken)
    monkeypatch.setitem(health.CHECKS, "redis", broken)

    response = await anonymous_client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_ready_when_every_dependency_answers(anonymous_client, healthy):
    response = await anonymous_client.get("/health/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"]["database"]["status"] == "ok"
    assert body["checks"]["redis"]["status"] == "ok"


async def test_not_ready_when_postgres_is_unreachable(
    anonymous_client, healthy, monkeypatch
):
    # A real connection attempt to a port nothing listens on.
    dead_engine = create_async_engine(
        "postgresql+asyncpg://nobody:nothing@127.0.0.1:1/none", poolclass=NullPool
    )
    monkeypatch.setattr(database, "engine", dead_engine)
    monkeypatch.setitem(health.CHECKS, "database", health.check_database)

    response = await anonymous_client.get("/health/ready")
    await dead_engine.dispose()

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["database"]["status"] == "error"
    assert body["checks"]["redis"]["status"] == "ok"
    # No connection details leak into the response.
    assert "127.0.0.1" not in response.text
    assert "nobody" not in response.text


async def test_not_ready_when_redis_is_unreachable(
    anonymous_client, healthy, monkeypatch
):
    dead_redis = Redis(host="127.0.0.1", port=1, socket_connect_timeout=1)
    monkeypatch.setattr(redis_infra, "redis_client", dead_redis)
    monkeypatch.setitem(health.CHECKS, "redis", health.check_redis)

    response = await anonymous_client.get("/health/ready")
    await dead_redis.aclose()

    assert response.status_code == 503
    assert response.json()["checks"]["redis"]["status"] == "error"
    assert response.json()["checks"]["database"]["status"] == "ok"


async def test_a_hanging_dependency_times_out(anonymous_client, healthy, monkeypatch):
    async def hangs() -> None:
        await asyncio.sleep(10)

    monkeypatch.setattr(settings, "HEALTH_CHECK_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setitem(health.CHECKS, "database", hangs)

    response = await anonymous_client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["database"] == {
        "status": "error",
        "error": "timeout",
    }
