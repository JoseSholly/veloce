import re
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from app.models.user import UserRole
from tests.helpers import delivery_payload, make_courier, make_user

USER_CODE = re.compile(r"^VEL-(CUS|COU|ADM)-\d{4,}$")
DELIVERY_CODE = re.compile(r"^VEL-DEL-(\d{14})-([A-Z0-9]{8})$")


def number(code: str) -> int:
    return int(code.rsplit("-", 1)[1])


async def test_each_role_gets_its_own_prefix(db_session):
    customer = await make_user(db_session, email="c@example.com")
    courier = await make_user(db_session, email="k@example.com", role=UserRole.COURIER)
    admin = await make_user(db_session, email="a@example.com", role=UserRole.ADMIN)

    assert customer.code.startswith("VEL-CUS-")
    assert courier.code.startswith("VEL-COU-")
    assert admin.code.startswith("VEL-ADM-")
    for user in (customer, courier, admin):
        assert USER_CODE.match(user.code)


async def test_codes_count_up_and_never_repeat(db_session):
    first = await make_user(db_session, email="one@example.com")
    second = await make_user(db_session, email="two@example.com")

    assert number(second.code) > number(first.code)


async def test_a_role_change_issues_a_new_code(db_session):
    user = await make_user(db_session, email="promoted@example.com")
    old_code = user.code

    user.role = UserRole.ADMIN
    await db_session.flush()

    assert user.code.startswith("VEL-ADM-")
    assert user.code != old_code


async def test_a_role_change_made_in_sql_also_issues_a_new_code(db_session):
    """The README tells admins to promote accounts in psql; the trigger covers that too."""
    user = await make_user(db_session, email="sql@example.com")

    await db_session.execute(
        text("UPDATE users SET role = 'admin' WHERE id = :id"), {"id": user.id}
    )
    code = await db_session.scalar(
        text("SELECT code FROM users WHERE id = :id"), {"id": user.id}
    )

    assert code.startswith("VEL-ADM-")


async def test_numbers_keep_growing_past_four_digits(db_session):
    await db_session.execute(text("SELECT setval('user_code_customer_seq', 10000)"))

    user = await make_user(db_session, email="big@example.com")

    assert user.code == "VEL-CUS-10001"


async def test_the_api_shows_the_account_code(client, customer):
    body = (await client.get("/api/v1/auth/me")).json()

    assert body["code"] == customer.code
    assert USER_CODE.match(body["code"])


async def test_a_new_delivery_gets_a_timestamped_code(client):
    before = datetime.now(UTC).replace(microsecond=0)
    response = await client.post("/api/v1/deliveries", json=delivery_payload())
    after = datetime.now(UTC)

    body = response.json()
    match = DELIVERY_CODE.match(body["code"])
    assert match, body["code"]
    stamp = datetime.strptime(match.group(1), "%Y%m%d%H%M%S").replace(tzinfo=UTC)
    assert before <= stamp <= after


async def test_delivery_codes_are_unique(client):
    codes = {
        (await client.post("/api/v1/deliveries", json=delivery_payload())).json()[
            "code"
        ]
        for _ in range(5)
    }

    assert len(codes) == 5


async def test_an_assigned_delivery_shows_the_courier_code(admin_client, db_session):
    courier = await make_courier(db_session)
    delivery = (
        await admin_client.post("/api/v1/deliveries", json=delivery_payload())
    ).json()

    response = await admin_client.post(
        f"/api/v1/deliveries/{delivery['id']}/assign", json={"courier_id": courier.id}
    )

    assert response.json()["courier_code"] == courier.user.code


@pytest.mark.parametrize("path", ["/api/v1/couriers"])
async def test_courier_responses_carry_the_account_code(admin_client, db_session, path):
    courier = await make_courier(db_session)

    items = (await admin_client.get(path)).json()

    assert any(item["code"] == courier.user.code for item in items)
