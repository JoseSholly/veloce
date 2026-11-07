import asyncio

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app
from app.models.courier import Courier
from app.models.user import User, UserRole
from tests.helpers import headers_for, make_courier, make_user


def _test_database_url() -> str:
    url = settings.TEST_DATABASE_URL
    assert url and "test" in url, "TEST_DATABASE_URL must point at a *test* database"
    return url


async def _reset_schema() -> None:
    engine = create_async_engine(_test_database_url(), poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def prepare_database():
    """Build the empty tables once, before the first test runs."""
    asyncio.run(_reset_schema())


@pytest.fixture
async def db_session():
    """A session whose work is thrown away after each test.

    The test owns an outer transaction. The session runs inside a savepoint,
    so service code can call commit() and nothing is really saved.
    """
    engine = create_async_engine(_test_database_url(), poolclass=NullPool)

    async with engine.connect() as connection:
        outer_transaction = await connection.begin()
        session = AsyncSession(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        try:
            yield session
        finally:
            await session.close()
            await outer_transaction.rollback()

    await engine.dispose()


@pytest.fixture
async def customer(db_session) -> User:
    return await make_user(db_session, email="customer@example.com")


@pytest.fixture
async def admin_user(db_session) -> User:
    return await make_user(db_session, email="admin@example.com", role=UserRole.ADMIN)


@pytest.fixture
async def courier_user(db_session) -> User:
    return await make_user(
        db_session, email="courier@example.com", role=UserRole.COURIER
    )


@pytest.fixture
async def anonymous_client(db_session):
    """An HTTP client with no token. Its app uses the test session."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
async def client(anonymous_client, customer):
    """The same client, logged in as a customer.

    For a test with several users, use anonymous_client and pass
    headers=headers_for(user) on each request instead.
    """
    anonymous_client.headers.update(headers_for(customer))
    return anonymous_client


@pytest.fixture
async def admin_client(anonymous_client, admin_user):
    """The same client, logged in as an admin."""
    anonymous_client.headers.update(headers_for(admin_user))
    return anonymous_client


@pytest.fixture
async def courier(db_session) -> Courier:
    return await make_courier(db_session)


@pytest.fixture
async def unavailable_courier(db_session) -> Courier:
    return await make_courier(db_session, available=False)


@pytest.fixture
async def committed_session_factory():
    """For concurrency tests: sessions that really commit, cleaned up by TRUNCATE."""
    engine = create_async_engine(_test_database_url(), poolclass=NullPool)

    yield async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.execute(
            text("TRUNCATE deliveries, couriers, users RESTART IDENTITY CASCADE")
        )
    await engine.dispose()
