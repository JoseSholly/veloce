from enum import Enum
from typing import ClassVar

from sqlalchemy import DDL, Boolean, FetchedValue, Integer, String, event, false
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.db.codes import CREATE_USER_CODE_OBJECTS, DROP_USER_CODE_OBJECTS


class UserRole(str, Enum):
    CUSTOMER = "customer"
    COURIER = "courier"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"
    # Read the trigger-assigned code back with RETURNING after insert and update.
    __mapper_args__: ClassVar[dict] = {"eager_defaults": True}

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Public account code, e.g. VEL-CUS-0100. Assigned by a database trigger
    # (see app/db/codes.py); never set it from Python.
    code: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False,
        server_default=FetchedValue(),
        server_onupdate=FetchedValue(),
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(
            UserRole,
            name="user_role",
            values_callable=lambda enum: [member.value for member in enum],
        ),
        nullable=False,
        default=UserRole.CUSTOMER,
        server_default=UserRole.CUSTOMER.value,
    )
    # Set for accounts created with a temporary password (couriers). Until it is
    # cleared, the user can only change their password.
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )


# create_all (used by the tests) builds the trigger too; drop_all removes it.
for _statement in CREATE_USER_CODE_OBJECTS:
    event.listen(User.__table__, "after_create", DDL(_statement))
for _statement in DROP_USER_CODE_OBJECTS:
    event.listen(User.__table__, "after_drop", DDL(_statement))
