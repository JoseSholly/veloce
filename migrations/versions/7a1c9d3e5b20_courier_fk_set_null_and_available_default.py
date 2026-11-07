"""courier fk set null and available default

Revision ID: 7a1c9d3e5b20
Revises: 0e4cf4d0bbe5
Create Date: 2026-10-30 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7a1c9d3e5b20"
down_revision: str | Sequence[str] | None = "0e4cf4d0bbe5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint("deliveries_courier_id_fkey", "deliveries", type_="foreignkey")
    op.create_foreign_key(
        "deliveries_courier_id_fkey",
        "deliveries",
        "couriers",
        ["courier_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.alter_column(
        "couriers",
        "available",
        existing_type=sa.Boolean(),
        server_default=sa.true(),
        existing_nullable=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "couriers",
        "available",
        existing_type=sa.Boolean(),
        server_default=None,
        existing_nullable=False,
    )
    op.drop_constraint("deliveries_courier_id_fkey", "deliveries", type_="foreignkey")
    op.create_foreign_key(
        "deliveries_courier_id_fkey",
        "deliveries",
        "couriers",
        ["courier_id"],
        ["id"],
    )
