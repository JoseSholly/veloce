from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.courier import Courier


class DeliveryStatus(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    PICKED_UP = "picked_up"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class Delivery(Base):
    __tablename__ = "deliveries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    courier_id: Mapped[int | None] = mapped_column(
        ForeignKey("couriers.id", ondelete="SET NULL"),
        nullable=True,
    )

    pickup: Mapped[dict] = mapped_column(JSON, nullable=False)
    dropoff: Mapped[dict] = mapped_column(JSON, nullable=False)

    recipient_name: Mapped[str] = mapped_column(String(100), nullable=False)
    package_description: Mapped[str] = mapped_column(String(500), nullable=False)
    delivery_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[DeliveryStatus] = mapped_column(
        SAEnum(
            DeliveryStatus,
            name="delivery_status",
            values_callable=lambda enum: [member.value for member in enum],
        ),
        nullable=False,
        default=DeliveryStatus.PENDING,
    )
    courier: Mapped[Courier | None] = relationship(back_populates="deliveries")
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
