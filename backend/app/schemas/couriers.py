from pydantic import BaseModel, Field


class CourierCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=10, max_length=20)
    user_id: int | None = None


class CourierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    phone: str | None = Field(default=None, min_length=10, max_length=20)


class CourierResponse(BaseModel):
    id: int
    name: str
    phone: str
    available: bool
    user_id: int | None = None
