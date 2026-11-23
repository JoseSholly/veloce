import pytest

from app.models.user import UserRole
from app.services.delivery_service import DeliveryService
from app.services.exceptions import ResourceNotFoundError
from tests.helpers import delivery_create, make_courier, make_delivery, make_user


async def test_customer_cannot_get_another_customers_delivery(db_session, customer):
    other = await make_user(db_session, email="other@example.com")
    delivery = await make_delivery(db_session, customer)

    with pytest.raises(ResourceNotFoundError):
        await DeliveryService(db_session).get_delivery(delivery.id, other)


async def test_customer_cannot_cancel_another_customers_delivery(db_session, customer):
    other = await make_user(db_session, email="other@example.com")
    delivery = await make_delivery(db_session, customer)

    with pytest.raises(ResourceNotFoundError):
        await DeliveryService(db_session).cancel_delivery(delivery.id, other)


async def test_failed_cancel_by_stranger_leaves_courier_busy(
    db_session, customer, courier
):
    other = await make_user(db_session, email="other@example.com")
    delivery = await make_delivery(db_session, customer, courier=courier)
    # Settle the setup: a failing service call rolls back to the last commit.
    await db_session.commit()

    with pytest.raises(ResourceNotFoundError):
        await DeliveryService(db_session).cancel_delivery(delivery.id, other)

    await db_session.commit()
    await db_session.refresh(courier)
    assert courier.available is False


async def test_admin_can_get_any_delivery(db_session, customer, admin_user):
    delivery = await make_delivery(db_session, customer)

    found = await DeliveryService(db_session).get_delivery(delivery.id, admin_user)

    assert found.id == delivery.id


async def test_list_only_returns_the_users_own_deliveries(db_session, customer):
    other = await make_user(db_session, email="other@example.com")
    service = DeliveryService(db_session)
    await service.create_delivery(delivery_create(), customer)
    await service.create_delivery(delivery_create(), other)

    items, total = await service.list_deliveries(customer, page=1, page_size=20)

    assert total == 1
    assert [d.customer_id for d in items] == [customer.id]


async def test_courier_user_sees_only_deliveries_assigned_to_them(
    db_session, customer, courier_user
):
    assert courier_user.role == UserRole.COURIER
    profile = await make_courier(db_session, user_id=courier_user.id)
    mine = await make_delivery(db_session, customer, courier=profile)
    await make_delivery(db_session, customer)

    items, total = await DeliveryService(db_session).list_deliveries(
        courier_user, page=1, page_size=20
    )

    assert total == 1
    assert items[0].id == mine.id


async def test_courier_user_cannot_get_a_delivery_assigned_to_another_courier(
    db_session, customer, courier_user
):
    await make_courier(db_session, user_id=courier_user.id)
    someone_elses = await make_courier(db_session)
    delivery = await make_delivery(db_session, customer, courier=someone_elses)

    with pytest.raises(ResourceNotFoundError):
        await DeliveryService(db_session).get_delivery(delivery.id, courier_user)
