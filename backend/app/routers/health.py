"""Liveness and readiness.

- /health/live: the process is up and serving requests. It checks nothing else,
  so a database outage never makes an orchestrator restart a healthy process.
- /health/ready: the process can do useful work right now, because PostgreSQL
  and Redis both answer. A load balancer should stop sending traffic while
  this returns 503, and resume when it returns 200.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.core import database
from app.core.config import settings
from app.infrastructure import redis as redis_infra

router = APIRouter(prefix="/health", tags=["Health"])
logger = logging.getLogger(__name__)


async def check_database() -> None:
    async with database.engine.connect() as conn:
        await conn.execute(text("SELECT 1"))


async def check_redis() -> None:
    await redis_infra.redis_client.ping()


CHECKS: dict[str, Callable[[], Awaitable[None]]] = {
    "database": check_database,
    "redis": check_redis,
}


async def _run(name: str, check: Callable[[], Awaitable[None]]) -> dict:
    started = time.perf_counter()
    try:
        await asyncio.wait_for(check(), timeout=settings.HEALTH_CHECK_TIMEOUT_SECONDS)
    except Exception as exc:  # noqa: BLE001 - any failure means "not ready", never a crash
        reason = "timeout" if isinstance(exc, TimeoutError) else type(exc).__name__
        logger.warning(
            "Readiness check failed", extra={"check": name, "reason": reason}
        )
        # The exception class only: messages can contain hostnames or credentials.
        return {"status": "error", "error": reason}
    return {
        "status": "ok",
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
    }


@router.get("/live")
async def live():
    return {"status": "ok"}


@router.get("/ready")
async def ready(response: Response):
    results = await asyncio.gather(
        *(_run(name, check) for name, check in CHECKS.items())
    )
    checks = dict(zip(CHECKS, results, strict=True))
    is_ready = all(result["status"] == "ok" for result in checks.values())

    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ready" if is_ready else "not_ready", "checks": checks}
