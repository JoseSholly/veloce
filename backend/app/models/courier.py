from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.delivery import Delivery
    from app.models.user import User


class Courier(Base):
    __tablename__ = "couriers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    available: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=true(),
        nullable=False,
    )

    deliveries: Mapped[list[Delivery]] = relationship(back_populates="courier")
    # Every courier signs in with their own account. A user with a courier
    # profile cannot be deleted while the profile exists.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    user: Mapped[User] = relationship(lazy="selectin")

    @property
    def code(self) -> str:
        """A courier is known by their account code, e.g. VEL-COU-0100."""
        return self.user.code

    @property
    def email(self) -> str:
        return self.user.email
