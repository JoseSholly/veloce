from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.user import UserCreate


def normalize_email(email: str) -> str:
    """One address, one account: Jose@Example.com and jose@example.com are the same."""
    return email.strip().lower()


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register(self, data: UserCreate) -> User:
        email = normalize_email(data.email)

        existing = await self.db.scalar(select(User).where(User.email == email))

        if existing:
            raise ValueError("Email already registered")

        user = User(
            email=email,
            full_name=data.full_name,
            hashed_password=hash_password(data.password),
        )

        self.db.add(user)

        try:
            await self.db.commit()
            await self.db.refresh(user)
        except IntegrityError:
            # Two simultaneous registrations: the unique index decides.
            await self.db.rollback()
            raise ValueError("Email already registered")
        except Exception:
            await self.db.rollback()
            raise

        return user

    async def authenticate(
        self,
        email: str,
        password: str,
    ) -> User | None:
        user = await self.db.scalar(
            select(User).where(User.email == normalize_email(email))
        )

        if user is None:
            return None

        if not verify_password(password, user.hashed_password):
            return None

        if not user.is_active:
            return None

        return user
