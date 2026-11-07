import pytest

from app.models.delivery import DeliveryStatus
from app.services.delivery_service import DeliveryService
from app.services.exceptions import BusinessRuleViolationError, ResourceNotFoundError
from tests.helpers import delivery_create, make_delivery


async def test_create_delivery_is_pending_and_owned_by_the_creator(
    db_session, customer
):
    delivery = await DeliveryService(db_session).create_delivery(
        delivery_create(), customer
    )

    assert delivery.status == DeliveryStatus.PENDING
    assert delivery.courier_id is None
    assert delivery.customer_id == customer.id


async def test_assign_available_courier(db_session, customer, admin_user, courier):
    delivery = await make_delivery(db_session, customer)

    assigned = await DeliveryService(db_session).assign_courier(
        delivery.id, courier.id, admin_user
    )

    await db_session.refresh(courier)
    assert assigned.status == DeliveryStatus.ASSIGNED
    assert assigned.courier_id == courier.id
    assert courier.available is False


async def test_assign_nonexistent_courier_is_rejected(db_session, customer, admin_user):
    delivery = await make_delivery(db_session, customer)

    with pytest.raises(ResourceNotFoundError):
        await DeliveryService(db_session).assign_courier(delivery.id, 9999, admin_user)


async def test_assign_unavailable_courier_is_rejected(
    db_session, customer, admin_user, unavailable_courier
):
    delivery = await make_delivery(db_session, customer)

    with pytest.raises(BusinessRuleViolationError):
        await DeliveryService(db_session).assign_courier(
            delivery.id, unavailable_courier.id, admin_user
        )


async def test_assign_to_a_delivery_that_is_not_pending_is_rejected(
    db_session, customer, admin_user, courier
):
    delivery = await make_delivery(db_session, customer)
    delivery.status = DeliveryStatus.CANCELLED
    await db_session.flush()
    # Settle the setup: a failing service call rolls back to the last commit.
    await db_session.commit()

    with pytest.raises(BusinessRuleViolationError):
        await DeliveryService(db_session).assign_courier(
            delivery.id, courier.id, admin_user
        )

    await db_session.commit()
    await db_session.refresh(courier)
    assert courier.available is True


async def test_assign_missing_delivery(db_session, admin_user, courier):
    with pytest.raises(ResourceNotFoundError):
        await DeliveryService(db_session).assign_courier(9999, courier.id, admin_user)


async def test_cancel_pending_delivery(db_session, customer):
    delivery = await make_delivery(db_session, customer)

    cancelled = await DeliveryService(db_session).cancel_delivery(delivery.id, customer)

    assert cancelled.status == DeliveryStatus.CANCELLED


async def test_cancel_assigned_delivery_releases_courier(db_session, customer, courier):
    delivery = await make_delivery(db_session, customer, courier=courier)

    await DeliveryService(db_session).cancel_delivery(delivery.id, customer)

    await db_session.refresh(courier)
    assert courier.available is True


async def test_delivered_delivery_cannot_be_cancelled(db_session, customer):
    delivery = await make_delivery(db_session, customer)
    delivery.status = DeliveryStatus.DELIVERED
    await db_session.flush()

    with pytest.raises(BusinessRuleViolationError):
        await DeliveryService(db_session).cancel_delivery(delivery.id, customer)


async def test_cancel_missing_delivery(db_session, customer):
    with pytest.raises(ResourceNotFoundError):
        await DeliveryService(db_session).cancel_delivery(9999, customer)


async def test_failed_cancel_leaves_courier_busy(db_session, customer, courier):
    delivery = await make_delivery(db_session, customer, courier=courier)
    delivery.status = DeliveryStatus.IN_TRANSIT
    await db_session.flush()
    # Settle the setup: a failing service call rolls back to the last commit.
    await db_session.commit()

    with pytest.raises(BusinessRuleViolationError):
        await DeliveryService(db_session).cancel_delivery(delivery.id, customer)

    # Anything half-done and left in the session would be saved by the next
    # commit, so make one before checking.
    await db_session.commit()
    await db_session.refresh(courier)
    assert courier.available is False
