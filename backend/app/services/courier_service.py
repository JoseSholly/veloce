import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.courier import Courier
from app.models.user import User, UserRole
from app.schemas.couriers import CourierCreate, CourierUpdate
from app.services.auth_service import normalize_email
from app.services.exceptions import ConflictError, ResourceNotFoundError

# Readable temporary passwords: no 0/O or 1/l/I to misread when passed on.
_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_temporary_password(length: int = 12) -> str:
    return "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(length))


class CourierService:
    """Couriers are people with a login: a courier profile always has a user."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_couriers(self, available: bool | None = None) -> list[Courier]:
        stmt = select(Courier).order_by(Courier.id)
        if available is not None:
            stmt = stmt.where(Courier.available == available)
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_courier(self, courier_id: int) -> Courier:
        courier = await self.db.get(Courier, courier_id)
        if courier is None:
            raise ResourceNotFoundError("Courier not found")
        return courier

    async def create_courier(self, data: CourierCreate) -> tuple[Courier, str]:
        """Create the login account and the courier profile together.

        Returns the courier and their temporary password. The password is not
        stored anywhere in plain text, so this is the only time it exists.
        """
        email = normalize_email(data.email)
        if await self.db.scalar(select(User.id).where(User.email == email)):
            raise ConflictError("Email already registered")

        temporary_password = generate_temporary_password()
        user = User(
            email=email,
            full_name=data.name,
            hashed_password=hash_password(temporary_password),
            role=UserRole.COURIER,
            must_change_password=True,
        )
        courier = Courier(name=data.name, phone=data.phone, available=True, user=user)
        self.db.add(courier)

        try:
            await self.db.commit()
        except IntegrityError:
            # Two admins adding the same email at once: the unique index decides.
            await self.db.rollback()
            raise ConflictError("Email already registered")
        except Exception:
            await self.db.rollback()
            raise

        await self.db.refresh(courier)
        return courier, temporary_password

    async def update_courier(self, courier_id: int, data: CourierUpdate) -> Courier:
        courier = await self.get_courier(courier_id)
        changes = data.model_dump(exclude_none=True)
        for field, value in changes.items():
            setattr(courier, field, value)
        # The account's name follows the courier's name.
        if "name" in changes:
            courier.user.full_name = changes["name"]

        try:
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        await self.db.refresh(courier)
        return courier
