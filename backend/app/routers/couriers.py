from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_roles
from app.models.user import UserRole
from app.schemas.couriers import (
    CourierCreate,
    CourierCreatedResponse,
    CourierResponse,
    CourierUpdate,
)
from app.services.courier_service import CourierService

# Every courier route is admin-only.
router = APIRouter(
    prefix="/couriers",
    tags=["Couriers"],
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)


def get_courier_service(db: Annotated[AsyncSession, Depends(get_db)]) -> CourierService:
    return CourierService(db)


Service = Annotated[CourierService, Depends(get_courier_service)]


@router.post(
    "", response_model=CourierCreatedResponse, status_code=status.HTTP_201_CREATED
)
async def create_courier(data: CourierCreate, service: Service):
    """Onboard a courier: creates their login account and profile together.

    The response contains a temporary password, shown only this once. The
    courier must replace it the first time they sign in.
    """
    courier, temporary_password = await service.create_courier(data)
    return CourierCreatedResponse(
        **CourierResponse.model_validate(courier).model_dump(),
        temporary_password=temporary_password,
    )


@router.get("", response_model=list[CourierResponse])
async def list_couriers(
    service: Service,
    available: Annotated[
        bool | None, Query(description="Filter by availability status")
    ] = None,
):
    return await service.list_couriers(available)


@router.get("/{courier_id}", response_model=CourierResponse)
async def retrieve_courier(courier_id: int, service: Service):
    return await service.get_courier(courier_id)


@router.patch("/{courier_id}", response_model=CourierResponse)
async def update_courier(courier_id: int, data: CourierUpdate, service: Service):
    return await service.update_courier(courier_id, data)
