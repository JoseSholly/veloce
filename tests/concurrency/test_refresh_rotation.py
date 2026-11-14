import asyncio

from sqlalchemy import func, select

from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.exceptions import AuthenticationError
from tests.helpers import make_user


async def test_two_simultaneous_refreshes_with_one_token_cannot_both_win(
    committed_session_factory,
):
    async with committed_session_factory() as setup_session:
        user = await make_user(setup_session)
        await setup_session.commit()
        user_id = user.id
        tokens = await AuthService(setup_session).create_tokens(user)

    async def try_to_refresh():
        # Each attempt gets its own session, and so its own database connection.
        async with committed_session_factory() as session:
            return await AuthService(session).refresh(tokens.refresh_token)

    results = await asyncio.gather(
        try_to_refresh(), try_to_refresh(), return_exceptions=True
    )

    successes = [r for r in results if not isinstance(r, Exception)]
    failures = [r for r in results if isinstance(r, AuthenticationError)]
    assert len(successes) == 1
    assert len(failures) == 1

    # The loser looks exactly like a stolen token being replayed, so the whole
    # session is ended: nothing is left that could still be refreshed.
    async with committed_session_factory() as check_session:
        still_usable = await check_session.scalar(
            select(func.count())
            .select_from(RefreshToken)
            .where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
            )
        )
    assert still_usable == 0


async def test_refreshes_on_different_sessions_do_not_interfere(
    committed_session_factory,
):
    async with committed_session_factory() as setup_session:
        user = await make_user(setup_session)
        await setup_session.commit()
        user_id = user.id
        first = await AuthService(setup_session).create_tokens(user)
        second = await AuthService(setup_session).create_tokens(user)

    async def refresh_with(token: str):
        async with committed_session_factory() as session:
            return await AuthService(session).refresh(token)

    results = await asyncio.gather(
        refresh_with(first.refresh_token),
        refresh_with(second.refresh_token),
        return_exceptions=True,
    )

    assert not any(isinstance(r, Exception) for r in results)
    async with committed_session_factory() as check_session:
        user = await check_session.get(User, user_id)
        usable = await check_session.scalar(
            select(func.count())
            .select_from(RefreshToken)
            .where(
                RefreshToken.user_id == user.id,
                RefreshToken.revoked_at.is_(None),
            )
        )
    assert usable == 2
