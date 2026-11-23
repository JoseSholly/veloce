from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import engine
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestIdMiddleware
from app.infrastructure.redis import redis_client
from app.routers import auth, couriers, deliveries, health

configure_logging(settings.LOG_LEVEL, settings.LOG_JSON)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await redis_client.aclose()
    await engine.dispose()


app = FastAPI(
    title="Veloce Delivery & Dispatch API", version="1.0.0", lifespan=lifespan
)

app.add_middleware(RequestIdMiddleware)
install_error_handlers(app)

# Business API, versioned so breaking changes can ship as /api/v2 later.
api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth.router)
api_v1.include_router(deliveries.router)
api_v1.include_router(couriers.router)
app.include_router(api_v1)

# Operational endpoints stay unversioned: probes should not change with the API.
app.include_router(health.router)

# Browser UI for the API, served from the same origin so no CORS is needed.
app.mount(
    "/ui",
    StaticFiles(directory=Path(__file__).parent / "static", html=True),
    name="ui",
)


@app.get("/", include_in_schema=False)
async def root():
    return {
        "service": "veloce",
        "docs": "/docs",
        "api": "/api/v1",
        "health": "/health/ready",
    }
