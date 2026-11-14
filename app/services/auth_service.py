import uuid
from datetime import UTC, datetime, timedelta
from typing import NamedTuple

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.user import UserCreate
from app.services.exceptions import AuthenticationError


def normalize_email(email: str) -> str:
    """One address, one account: Jose@Example.com and jose@example.com are the same."""
    return email.strip().lower()


class TokenPair(NamedTuple):
    access_token: str
    refresh_token: str


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

    # --- Refresh tokens -----------------------------------------------------

    async def _commit(self) -> None:
        try:
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

    def _add_refresh_token(self, user_id: int, family_id: str) -> str:
        """Stage a new refresh token and return the raw value (the only copy)."""
        raw_token = generate_refresh_token()
        self.db.add(
            RefreshToken(
                user_id=user_id,
                family_id=family_id,
                token_hash=hash_refresh_token(raw_token),
                expires_at=datetime.now(UTC)
                + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            )
        )
        return raw_token

    async def _find_refresh_token(
        self, raw_token: str, *, for_update: bool = False
    ) -> RefreshToken | None:
        stmt = select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(raw_token)
        )
        if for_update:
            stmt = stmt.with_for_update()
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def _revoke_family(self, family_id: str, now: datetime) -> None:
        await self.db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.family_id == family_id,
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )

    async def create_tokens(self, user: User) -> TokenPair:
        """Start a new session: an access token and the first refresh token."""
        raw_token = self._add_refresh_token(user.id, uuid.uuid4().hex)
        await self._commit()
        return TokenPair(create_access_token(str(user.id)), raw_token)

    async def refresh(self, raw_token: str) -> TokenPair:
        """Trade a refresh token for a new pair. The used token is retired."""
        now = datetime.now(UTC)
        # The row lock makes two simultaneous refreshes with the same token take
        # turns: the second one finds it already used.
        token = await self._find_refresh_token(raw_token, for_update=True)

        if token is None:
            raise AuthenticationError("Invalid refresh token")

        if token.revoked_at is not None:
            # A retired token came back: it was copied. Kill the whole session
            # so neither the thief nor the owner can keep refreshing.
            await self._revoke_family(token.family_id, now)
            await self._commit()
            raise AuthenticationError("Invalid refresh token")

        if token.expires_at <= now:
            await self.db.rollback()
            raise AuthenticationError("Refresh token expired")

        user = await self.db.get(User, token.user_id)
        if user is None or not user.is_active:
            await self._revoke_family(token.family_id, now)
            await self._commit()
            raise AuthenticationError("Invalid refresh token")

        token.revoked_at = now
        new_raw_token = self._add_refresh_token(user.id, token.family_id)
        await self._commit()
        return TokenPair(create_access_token(str(user.id)), new_raw_token)

    async def logout(self, raw_token: str) -> None:
        """End one session. Unknown or already-ended tokens are ignored."""
        token = await self._find_refresh_token(raw_token)
        if token is None:
            return

        await self._revoke_family(token.family_id, datetime.now(UTC))
        await self._commit()

    async def logout_all(self, user: User) -> None:
        """End every session this user has."""
        await self.db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.user_id == user.id,
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=datetime.now(UTC))
        )
        await self._commit()
