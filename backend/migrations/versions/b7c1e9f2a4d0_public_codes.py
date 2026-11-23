"""public codes for users and deliveries, and must_change_password

Revision ID: b7c1e9f2a4d0
Revises: 9d3d02af73d3
Create Date: 2026-11-23

Users get a role-based code (VEL-CUS-0100, VEL-COU-0100, VEL-ADM-0100) that a
trigger assigns on insert and re-issues when the role changes. Deliveries get
VEL-DEL-<UTC timestamp>-<8 random uppercase characters>. Existing rows are
backfilled; deliveries created before this migration take its run time as
their timestamp, because they had no creation time recorded.

The SQL is a frozen copy of app/db/codes.py at the time of writing.
"""

import secrets
import string
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision: str = "b7c1e9f2a4d0"
down_revision: str | Sequence[str] | None = "9d3d02af73d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PREFIX = {"customer": "CUS", "courier": "COU", "admin": "ADM"}

ASSIGN_USER_CODE = """
CREATE OR REPLACE FUNCTION assign_user_code() RETURNS trigger AS $$
DECLARE
    n bigint;
BEGIN
    IF TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role THEN
        n := nextval('user_code_' || NEW.role::text || '_seq');
        NEW.code := 'VEL-'
            || CASE NEW.role::text
                   WHEN 'customer' THEN 'CUS'
                   WHEN 'courier' THEN 'COU'
                   ELSE 'ADM'
               END
            || '-' || lpad(n::text, greatest(4, length(n::text)), '0');
    END IF;
    RETURN NEW;
END
$$ LANGUAGE plpgsql
"""


def _delivery_code(stamp: str) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return f"VEL-DEL-{stamp}-" + "".join(secrets.choice(alphabet) for _ in range(8))


def upgrade() -> None:
    conn = op.get_bind()

    # --- users -------------------------------------------------------------
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )
    op.add_column("users", sa.Column("code", sa.String(length=20), nullable=True))
    for role in PREFIX:
        op.execute(f"CREATE SEQUENCE user_code_{role}_seq START 100")

    # Backfill in id order, so the oldest accounts get the lowest numbers.
    for user_id, role in conn.execute(
        sa.text("SELECT id, role::text FROM users ORDER BY id")
    ):
        n = conn.execute(
            sa.text(f"SELECT nextval('user_code_{role}_seq')")
        ).scalar_one()
        conn.execute(
            sa.text("UPDATE users SET code = :code WHERE id = :id"),
            {"code": f"VEL-{PREFIX[role]}-{n:04d}", "id": user_id},
        )

    op.alter_column("users", "code", existing_type=sa.String(length=20), nullable=False)
    op.create_unique_constraint("users_code_key", "users", ["code"])
    op.execute(ASSIGN_USER_CODE)
    op.execute(
        "CREATE TRIGGER users_assign_code BEFORE INSERT OR UPDATE OF role ON users "
        "FOR EACH ROW EXECUTE FUNCTION assign_user_code()"
    )

    # --- deliveries --------------------------------------------------------
    op.add_column(
        "deliveries",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.add_column("deliveries", sa.Column("code", sa.String(length=40), nullable=True))
    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    for (delivery_id,) in conn.execute(
        sa.text("SELECT id FROM deliveries ORDER BY id")
    ):
        conn.execute(
            sa.text("UPDATE deliveries SET code = :code WHERE id = :id"),
            {"code": _delivery_code(stamp), "id": delivery_id},
        )
    op.alter_column(
        "deliveries", "code", existing_type=sa.String(length=40), nullable=False
    )
    op.create_unique_constraint("deliveries_code_key", "deliveries", ["code"])


def downgrade() -> None:
    op.drop_constraint("deliveries_code_key", "deliveries", type_="unique")
    op.drop_column("deliveries", "code")
    op.drop_column("deliveries", "created_at")

    op.execute("DROP TRIGGER IF EXISTS users_assign_code ON users")
    op.execute("DROP FUNCTION IF EXISTS assign_user_code()")
    op.drop_constraint("users_code_key", "users", type_="unique")
    op.drop_column("users", "code")
    for role in PREFIX:
        op.execute(f"DROP SEQUENCE IF EXISTS user_code_{role}_seq")
    op.drop_column("users", "must_change_password")
