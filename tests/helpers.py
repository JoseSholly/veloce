from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.models.courier import Courier
from app.models.delivery import Delivery, DeliveryStatus
from app.models.user import User, UserRole
from app.schemas.delivery import DeliveryCreate


def delivery_payload(**overrides) -> dict:
    payload = {
        "pickup": {
            "address": "Pickup address",
            "city": "Lagos",
            "latitude": 6.5,
            "longitude": 3.4,
        },
        "dropoff": {
            "address": "Dropoff address",
            "city": "Lagos",
            "latitude": 6.6,
            "longitude": 3.5,
        },
        "recipient_name": "Test Recipient",
        "package_description": "Documents",
    }
    payload.update(overrides)
    return payload


def delivery_create() -> DeliveryCreate:
    return DeliveryCreate.model_validate(delivery_payload())


async def make_courier(
    session: AsyncSession,
    *,
    available: bool = True,
    user_id: int | None = None,
) -> Courier:
    """Insert a courier. flush() sends the INSERT (so we get an id) without committing."""
    courier = Courier(
        name="Test Courier",
        phone="+2348012345678",
        available=available,
        user_id=user_id,
    )
    session.add(courier)
    await session.flush()
    return courier


async def make_user(
    session: AsyncSession,
    *,
    email: str = "user@example.com",
    role: UserRole = UserRole.CUSTOMER,
    is_active: bool = True,
) -> User:
    user = User(
        email=email,
        full_name="Test User",
        hashed_password=hash_password("password123"),
        role=role,
        is_active=is_active,
    )
    session.add(user)
    await session.flush()
    return user


async def make_delivery(
    session: AsyncSession,
    customer: User,
    *,
    courier: Courier | None = None,
) -> Delivery:
    """Insert a delivery directly. With a courier it is already assigned."""
    payload = delivery_payload()
    delivery = Delivery(
        customer_id=customer.id,
        courier_id=courier.id if courier else None,
        pickup=payload["pickup"],
        dropoff=payload["dropoff"],
        recipient_name=payload["recipient_name"],
        package_description=payload["package_description"],
        status=DeliveryStatus.ASSIGNED if courier else DeliveryStatus.PENDING,
    )
    if courier:
        courier.available = False
    session.add(delivery)
    await session.flush()
    return delivery


def headers_for(user: User) -> dict:
    """A real bearer token for this user."""
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


def forge_token(
    sub: str = "1",
    *,
    expires_in: timedelta = timedelta(minutes=5),
    key: str | None = None,
    algorithm: str | None = None,
    omit: tuple[str, ...] = (),
) -> str:
    """Build a token by hand so tests can break one thing at a time."""
    now = datetime.now(UTC)
    claims = {"sub": sub, "iat": now, "exp": now + expires_in}
    for name in omit:
        claims.pop(name)
    return jwt.encode(
        claims,
        key or settings.SECRET_KEY,
        algorithm=algorithm or settings.ALGORITHM,
    )


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
