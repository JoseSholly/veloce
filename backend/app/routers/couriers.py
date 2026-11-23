from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_roles
from app.models.courier import Courier
from app.models.user import UserRole
from app.schemas.couriers import CourierCreate, CourierResponse, CourierUpdate

# Every courier route is admin-only.
router = APIRouter(
    prefix="/couriers",
    tags=["Couriers"],
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_courier_or_404(db: AsyncSession, courier_id: int) -> Courier:
    courier = await db.get(Courier, courier_id)
    if courier is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Courier not found"
        )
    return courier


async def commit_or_conflict(db: AsyncSession) -> None:
    """Commit, turning a constraint violation into 409.

    Any other database error propagates and becomes a logged 500.
    """
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Operation conflicts with existing data",
        )


@router.post("", response_model=CourierResponse, status_code=status.HTTP_201_CREATED)
async def create_courier(courier: CourierCreate, db: DbSession):
    new_courier = Courier(name=courier.name, phone=courier.phone, available=True)
    db.add(new_courier)

    await commit_or_conflict(db)
    await db.refresh(new_courier)
    return new_courier


@router.get("", response_model=list[CourierResponse])
async def list_couriers(
    db: DbSession,
    available: Annotated[
        bool | None, Query(description="Filter by availability status")
    ] = None,
):
    stmt = select(Courier).order_by(Courier.id)
    if available is not None:
        stmt = stmt.where(Courier.available == available)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{courier_id}", response_model=CourierResponse)
async def retrieve_courier(courier_id: int, db: DbSession):
    return await get_courier_or_404(db, courier_id)


@router.patch("/{courier_id}", response_model=CourierResponse)
async def update_courier(courier_id: int, courier_update: CourierUpdate, db: DbSession):
    courier = await get_courier_or_404(db, courier_id)

    for field, value in courier_update.model_dump(exclude_none=True).items():
        setattr(courier, field, value)

    await commit_or_conflict(db)
    await db.refresh(courier)
    return courier
