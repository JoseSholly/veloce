"""every courier must have a login account

Revision ID: c4d8e1a9b3f6
Revises: b7c1e9f2a4d0
Create Date: 2026-11-23

couriers.user_id becomes NOT NULL, and deleting a user who has a courier
profile is refused (RESTRICT) instead of silently unlinking it.

Existing couriers without an account must be linked first:

    uv run alembic upgrade b7c1e9f2a4d0
    uv run python -m scripts.link_orphan_couriers
    uv run alembic upgrade head
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4d8e1a9b3f6"
down_revision: str | Sequence[str] | None = "b7c1e9f2a4d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    orphans = (
        op.get_bind()
        .execute(sa.text("SELECT count(*) FROM couriers WHERE user_id IS NULL"))
        .scalar_one()
    )
    if orphans:
        raise RuntimeError(
            f"{orphans} courier(s) have no login account. Create their accounts first:\n"
            "    uv run python -m scripts.link_orphan_couriers\n"
            "then run `uv run alembic upgrade head` again."
        )

    op.alter_column("couriers", "user_id", existing_type=sa.Integer(), nullable=False)
    op.drop_constraint("fk_couriers_user_id_users", "couriers", type_="foreignkey")
    op.create_foreign_key(
        "fk_couriers_user_id_users",
        "couriers",
        "users",
        ["user_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_couriers_user_id_users", "couriers", type_="foreignkey")
    op.create_foreign_key(
        "fk_couriers_user_id_users",
        "couriers",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.alter_column("couriers", "user_id", existing_type=sa.Integer(), nullable=True)
