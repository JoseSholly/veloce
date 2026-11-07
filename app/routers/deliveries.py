from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser, get_current_user, require_roles
from app.models.user import User, UserRole
from app.schemas.delivery import (
    AssignCourierRequest,
    DeliveryCreate,
    DeliveryListResponse,
    DeliveryResponse,
)
from app.services.delivery_service import DeliveryService

CustomerOrAdmin = Annotated[
    User, Depends(require_roles(UserRole.CUSTOMER, UserRole.ADMIN))
]


def get_delivery_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DeliveryService:
    return DeliveryService(db)


DeliveryServiceDep = Annotated[DeliveryService, Depends(get_delivery_service)]
AdminUser = Annotated[User, Depends(require_roles(UserRole.ADMIN))]
# Every route in this router requires a logged-in user.
router = APIRouter(
    prefix="/deliveries",
    tags=["Deliveries"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=DeliveryResponse, status_code=status.HTTP_201_CREATED)
async def create_delivery(
    delivery: DeliveryCreate, service: DeliveryServiceDep, user: CustomerOrAdmin
):
    return await service.create_delivery(delivery, user)


@router.get("", response_model=DeliveryListResponse)
async def list_deliveries(
    service: DeliveryServiceDep,
    user: CurrentUser,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    items, total = await service.list_deliveries(user, page, page_size)
    return {"items": items, "page": page, "page_size": page_size, "total": total}


@router.get("/{delivery_id}", response_model=DeliveryResponse)
async def get_delivery(
    delivery_id: int, service: DeliveryServiceDep, user: CurrentUser
):
    return await service.get_delivery(delivery_id, user)


@router.post("/{delivery_id}/assign", response_model=DeliveryResponse)
async def assign_courier(
    delivery_id: int,
    data: AssignCourierRequest,
    service: DeliveryServiceDep,
    user: AdminUser,
):
    return await service.assign_courier(delivery_id, data.courier_id, user)


@router.post("/{delivery_id}/cancel", response_model=DeliveryResponse)
async def cancel_delivery(
    delivery_id: int, service: DeliveryServiceDep, user: CustomerOrAdmin
):
    return await service.cancel_delivery(delivery_id, user)
