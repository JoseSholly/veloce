from sqlalchemy import ColumnElement, func, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.courier import Courier
from app.models.delivery import Delivery, DeliveryStatus
from app.models.user import User, UserRole
from app.schemas.delivery import DeliveryCreate
from app.services.exceptions import (
    BusinessRuleViolationError,
    ResourceNotFoundError,
)

CANCELLABLE_STATUSES = {DeliveryStatus.PENDING, DeliveryStatus.ASSIGNED}


def _visible_to(user: User) -> ColumnElement[bool]:
    """Which deliveries this user may see."""
    if user.role == UserRole.ADMIN:
        return true()
    if user.role == UserRole.COURIER:
        return Delivery.courier_id.in_(
            select(Courier.id).where(Courier.user_id == user.id)
        )
    return Delivery.customer_id == user.id


class DeliveryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_courier(
        self, courier_id: int, *, for_update: bool = False
    ) -> Courier:
        stmt = select(Courier).where(Courier.id == courier_id)
        if for_update:
            stmt = stmt.with_for_update()

        courier = (await self.db.execute(stmt)).scalar_one_or_none()

        if courier is None:
            raise ResourceNotFoundError("Courier not found")
        return courier

    async def _get_delivery(
        self, delivery_id: int, user: User, *, for_update: bool = False
    ) -> Delivery:
        stmt = select(Delivery).where(Delivery.id == delivery_id, _visible_to(user))
        if for_update:
            stmt = stmt.with_for_update()

        delivery = (await self.db.execute(stmt)).scalar_one_or_none()

        # Someone else's delivery gets the same 404 as one that doesn't exist.
        if delivery is None:
            raise ResourceNotFoundError("Delivery not found")
        return delivery

    async def get_delivery(self, delivery_id: int, user: User) -> Delivery:
        return await self._get_delivery(delivery_id, user)

    async def list_deliveries(
        self, user: User, page: int, page_size: int
    ) -> tuple[list[Delivery], int]:
        total = await self.db.scalar(
            select(func.count()).select_from(Delivery).where(_visible_to(user))
        )

        result = await self.db.execute(
            select(Delivery)
            .where(_visible_to(user))
            .order_by(Delivery.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total or 0

    async def create_delivery(self, data: DeliveryCreate, user: User) -> Delivery:
        """Customers only request a delivery. Assigning a courier is a separate step."""
        try:
            delivery = Delivery(
                customer_id=user.id,
                pickup=data.pickup.model_dump(mode="json"),
                dropoff=data.dropoff.model_dump(mode="json"),
                recipient_name=data.recipient_name,
                package_description=data.package_description,
                delivery_note=data.delivery_note,
                status=DeliveryStatus.PENDING,
            )
            self.db.add(delivery)

            await self.db.commit()
            await self.db.refresh(delivery)
            return delivery
        except Exception:
            await self.db.rollback()
            raise

    async def assign_courier(
        self, delivery_id: int, courier_id: int, user: User
    ) -> Delivery:
        try:
            # Lock order is always delivery -> courier.
            delivery = await self._get_delivery(delivery_id, user, for_update=True)

            if delivery.status != DeliveryStatus.PENDING:
                raise BusinessRuleViolationError(
                    f"Cannot assign a courier to a delivery with status "
                    f"'{delivery.status.value}'"
                )

            courier = await self._get_courier(courier_id, for_update=True)
            if not courier.available:
                raise BusinessRuleViolationError(f"Courier {courier_id} not available")

            courier.available = False
            delivery.courier_id = courier.id
            delivery.status = DeliveryStatus.ASSIGNED

            await self.db.commit()
            await self.db.refresh(delivery)
            return delivery
        except Exception:
            await self.db.rollback()
            raise

    async def cancel_delivery(self, delivery_id: int, user: User) -> Delivery:
        try:
            # Lock order is always delivery -> courier.
            delivery = await self._get_delivery(delivery_id, user, for_update=True)

            if delivery.status not in CANCELLABLE_STATUSES:
                raise BusinessRuleViolationError(
                    f"Cannot cancel a delivery with status '{delivery.status.value}'"
                )

            if delivery.courier_id is not None:
                courier = await self._get_courier(delivery.courier_id, for_update=True)
                courier.available = True

            delivery.status = DeliveryStatus.CANCELLED

            await self.db.commit()
            await self.db.refresh(delivery)
            return delivery
        except Exception:
            await self.db.rollback()
            raise
