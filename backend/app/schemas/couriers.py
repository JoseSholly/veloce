from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CourierCreate(BaseModel):
    """An admin onboards a courier: this creates their login account too."""

    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(min_length=10, max_length=20)


class CourierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    phone: str | None = Field(default=None, min_length=10, max_length=20)


class CourierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # `id` is for addresses and API calls; `code` is what people see.
    id: int
    code: str
    name: str
    email: EmailStr
    phone: str
    available: bool


class CourierCreatedResponse(CourierResponse):
    """Returned once, at creation: the only time the temporary password is shown."""

    temporary_password: str
