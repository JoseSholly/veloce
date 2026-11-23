from redis.asyncio import Redis

from app.core.config import settings

# Created once per process. It connects lazily, on the first command, so the
# app can start (and report "not ready") while Redis is down.
redis_client: Redis = Redis.from_url(
    settings.REDIS_URL,
    socket_connect_timeout=settings.HEALTH_CHECK_TIMEOUT_SECONDS,
    socket_timeout=settings.HEALTH_CHECK_TIMEOUT_SECONDS,
)
