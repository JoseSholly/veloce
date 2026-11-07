from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.security import create_access_token
from app.schemas.user import LoginRequest, TokenResponse, UserCreate, UserResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    data: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        return await AuthService(db).register(data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )


async def _login(db: AsyncSession, email: str, password: str) -> TokenResponse:
    user = await AuthService(db).authenticate(email, password)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """OAuth2 form login (used by Swagger's Authorize button).

    The standard field is called `username`; put the email in it.
    """
    return await _login(db, form_data.username, form_data.password)


@router.post("/login/json", response_model=TokenResponse)
async def login_json(
    data: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """The same login with a JSON body and a proper `email` field."""
    return await _login(db, data.email, data.password)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: CurrentUser):
    return current_user
