import asyncio

from sqlalchemy import func, select

from app.models.delivery import Delivery
from app.models.user import User, UserRole
from app.services.delivery_service import DeliveryService
from app.services.exceptions import BusinessRuleViolationError
from tests.helpers import make_courier, make_delivery, make_user


async def test_one_courier_cannot_be_assigned_to_two_deliveries_at_once(
    committed_session_factory,
):
    async with committed_session_factory() as setup_session:
        courier = await make_courier(setup_session)
        customer = await make_user(setup_session)
        admin = await make_user(
            setup_session, email="admin@example.com", role=UserRole.ADMIN
        )
        first = await make_delivery(setup_session, customer)
        second = await make_delivery(setup_session, customer)
        await setup_session.commit()
        courier_id, admin_id = courier.id, admin.id
        delivery_ids = [first.id, second.id]

    async def try_to_assign(delivery_id: int):
        # Each attempt gets its own session, and so its own database connection.
        async with committed_session_factory() as session:
            admin_user = await session.get(User, admin_id)
            return await DeliveryService(session).assign_courier(
                delivery_id, courier_id, admin_user
            )

    results = await asyncio.gather(
        *(try_to_assign(delivery_id) for delivery_id in delivery_ids),
        return_exceptions=True,
    )

    successes = [r for r in results if not isinstance(r, Exception)]
    failures = [r for r in results if isinstance(r, BusinessRuleViolationError)]
    assert len(successes) == 1
    assert len(failures) == 1

    async with committed_session_factory() as check_session:
        count = await check_session.scalar(
            select(func.count())
            .select_from(Delivery)
            .where(Delivery.courier_id == courier_id)
        )
    assert count == 1


async def test_two_admins_cannot_assign_the_same_delivery_twice(
    committed_session_factory,
):
    async with committed_session_factory() as setup_session:
        first_courier = await make_courier(setup_session)
        second_courier = await make_courier(setup_session)
        customer = await make_user(setup_session)
        admin = await make_user(
            setup_session, email="admin@example.com", role=UserRole.ADMIN
        )
        delivery = await make_delivery(setup_session, customer)
        await setup_session.commit()
        courier_ids = [first_courier.id, second_courier.id]
        admin_id, delivery_id = admin.id, delivery.id

    async def try_to_assign(courier_id: int):
        async with committed_session_factory() as session:
            admin_user = await session.get(User, admin_id)
            return await DeliveryService(session).assign_courier(
                delivery_id, courier_id, admin_user
            )

    results = await asyncio.gather(
        *(try_to_assign(courier_id) for courier_id in courier_ids),
        return_exceptions=True,
    )

    assert len([r for r in results if not isinstance(r, Exception)]) == 1
    assert len([r for r in results if isinstance(r, BusinessRuleViolationError)]) == 1
