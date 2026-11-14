from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_roles
from app.models.courier import Courier
from app.models.user import UserRole
from app.routers import auth, deliveries
from app.schemas.couriers import CourierCreate, CourierResponse, CourierUpdate
from app.services.exceptions import (
    AuthenticationError,
    BusinessRuleViolationError,
    ResourceNotFoundError,
)

app = FastAPI(
    title="Delivery & Dispatch API",
    version="1.0.0",
)

app.include_router(deliveries.router)
app.include_router(auth.router)

# Browser UI for the API, served from the same origin so no CORS is needed.
app.mount(
    "/ui",
    StaticFiles(directory=Path(__file__).parent / "static", html=True),
    name="ui",
)


require_admin = Depends(require_roles(UserRole.ADMIN))


@app.exception_handler(ResourceNotFoundError)
async def handle_not_found(request: Request, exc: ResourceNotFoundError):
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)}
    )


@app.exception_handler(AuthenticationError)
async def handle_authentication_error(request: Request, exc: AuthenticationError):
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": str(exc)},
        headers={"WWW-Authenticate": "Bearer"},
    )


@app.exception_handler(BusinessRuleViolationError)
async def handle_rule_violation(request: Request, exc: BusinessRuleViolationError):
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT, content={"detail": str(exc)}
    )


async def get_courier_or_404(db: AsyncSession, courier_id: int) -> Courier:
    courier = await db.get(Courier, courier_id)

    if courier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Courier not found",
        )

    return courier


async def commit_or_raise(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Operation conflicts with existing data",
        )
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred",
        )


@app.get("/")
async def root():
    return {"message": "Delivery API is running"}


@app.post(
    "/couriers",
    response_model=CourierResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_admin],
)
async def create_courier(
    courier: CourierCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    new_courier = Courier(name=courier.name, phone=courier.phone, available=True)

    db.add(new_courier)

    await commit_or_raise(db)
    await db.refresh(new_courier)

    return new_courier


@app.get(
    "/couriers",
    response_model=list[CourierResponse],
    dependencies=[require_admin],
)
async def list_couriers(
    db: Annotated[AsyncSession, Depends(get_db)],
    available: Annotated[
        bool | None,
        Query(description="Filter by availability status"),
    ] = None,
):
    stmt = select(Courier).order_by(Courier.id)

    if available is not None:
        stmt = stmt.where(Courier.available == available)

    result = await db.execute(stmt)

    return result.scalars().all()


@app.get(
    "/couriers/{courier_id}",
    response_model=CourierResponse,
    dependencies=[require_admin],
)
async def retrieve_courier(
    courier_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await get_courier_or_404(db, courier_id)


@app.patch(
    "/couriers/{courier_id}",
    response_model=CourierResponse,
    dependencies=[require_admin],
)
async def update_courier(
    courier_id: int,
    courier_update: CourierUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    courier = await get_courier_or_404(db, courier_id)

    for field, value in courier_update.model_dump(exclude_none=True).items():
        setattr(courier, field, value)

    await commit_or_raise(db)
    await db.refresh(courier)

    return courier
