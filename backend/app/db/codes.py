"""Public codes: the identifiers people see, instead of database ids.

- Accounts: VEL-CUS-0100, VEL-COU-0100, VEL-ADM-0100. One counter per role,
  starting at 100. A database trigger assigns the code on insert and issues
  a new one whenever the role changes (also for role changes made in psql).
  Old codes are never reused, because sequences only move forward.
- Deliveries: VEL-DEL-<UTC timestamp>-<8 random uppercase characters>,
  generated in Python when the delivery is created.

The SQL below is used by create_all (tests). The migration that introduced
codes has its own frozen copy, as migrations should.
"""

import secrets
import string
from datetime import UTC, datetime

DELIVERY_CODE_ALPHABET = string.ascii_uppercase + string.digits


def new_delivery_code() -> str:
    """VEL-DEL-20261123153012-K7Q2M9XA. Takes no arguments: SQLAlchemy calls it as a column default."""
    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    suffix = "".join(secrets.choice(DELIVERY_CODE_ALPHABET) for _ in range(8))
    return f"VEL-DEL-{stamp}-{suffix}"


USER_CODE_ROLES = {"customer": "CUS", "courier": "COU", "admin": "ADM"}

CREATE_USER_CODE_OBJECTS = [
    *(
        f"CREATE SEQUENCE IF NOT EXISTS user_code_{role}_seq START 100"
        for role in USER_CODE_ROLES
    ),
    """
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
    """,
    """
    CREATE TRIGGER users_assign_code
    BEFORE INSERT OR UPDATE OF role ON users
    FOR EACH ROW EXECUTE FUNCTION assign_user_code()
    """,
]

DROP_USER_CODE_OBJECTS = [
    "DROP FUNCTION IF EXISTS assign_user_code() CASCADE",
    *(f"DROP SEQUENCE IF EXISTS user_code_{role}_seq" for role in USER_CODE_ROLES),
]
