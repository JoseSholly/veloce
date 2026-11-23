"""Give every courier without a login account an account of their own.

One-off, for couriers created before accounts were required. Run it after
migration b7c1e9f2a4d0 and before c4d8e1a9b3f6:

    uv run alembic upgrade b7c1e9f2a4d0
    uv run python -m scripts.link_orphan_couriers
    uv run alembic upgrade head

Each new account gets a placeholder email (first.last@couriers.example.com,
a reserved domain that passes validation) and a temporary password, printed
once below. The courier must change it at first sign-in.
"""

import asyncio
import re

from sqlalchemy import select

from app.core.database import AsyncSessionLocal, engine
from app.core.security import hash_password
from app.models.courier import Courier
from app.models.delivery import (
    Delivery,  # noqa: F401  (registers the mapper Courier refers to)
)
from app.models.user import User, UserRole
from app.services.courier_service import generate_temporary_password

EMAIL_DOMAIN = "couriers.example.com"


def _local_part(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", ".", name.lower()).strip(".")
    return slug or "courier"


async def main() -> None:
    async with AsyncSessionLocal() as db:
        orphans = (
            (
                await db.execute(
                    select(Courier)
                    .where(Courier.user_id.is_(None))
                    .order_by(Courier.id)
                )
            )
            .scalars()
            .all()
        )
        if not orphans:
            print("Every courier already has an account. Nothing to do.")
            return

        taken = set((await db.execute(select(User.email))).scalars().all())
        created: list[tuple[Courier, User, str]] = []
        for courier in orphans:
            base = _local_part(courier.name)
            email, n = f"{base}@{EMAIL_DOMAIN}", 2
            while email in taken:
                email, n = f"{base}{n}@{EMAIL_DOMAIN}", n + 1
            taken.add(email)

            password = generate_temporary_password()
            user = User(
                email=email,
                full_name=courier.name,
                hashed_password=hash_password(password),
                role=UserRole.COURIER,
                must_change_password=True,
            )
            courier.user = user
            created.append((courier, user, password))

        # All or nothing: one commit for every account.
        await db.commit()

        print(
            f"Created {len(created)} courier account(s). Passwords are shown only now:\n"
        )
        print(f"{'Code':<14} {'Name':<22} {'Email':<38} Temporary password")
        for courier, user, password in created:
            print(f"{user.code:<14} {courier.name:<22} {user.email:<38} {password}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
