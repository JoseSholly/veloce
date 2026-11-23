from pydantic import BaseModel, Field

from app.models.delivery import DeliveryStatus


class Location(BaseModel):
    address: str = Field(min_length=3)
    city: str = Field(min_length=2)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class DeliveryCreate(BaseModel):
    pickup: Location
    dropoff: Location

    recipient_name: str = Field(min_length=2, max_length=100)
    package_description: str = Field(min_length=1, max_length=500)
    delivery_note: str | None = None


class AssignCourierRequest(BaseModel):
    courier_id: int


class DeliveryResponse(BaseModel):
    id: int
    courier_id: int | None
    pickup: Location
    dropoff: Location
    recipient_name: str
    package_description: str
    delivery_note: str | None
    status: DeliveryStatus


class DeliveryListResponse(BaseModel):
    items: list[DeliveryResponse]
    page: int
    page_size: int
    total: int
