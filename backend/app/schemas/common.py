from datetime import datetime
from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, PlainSerializer

T = TypeVar("T")

MoneyOut = Annotated[Decimal, PlainSerializer(lambda v: float(v) if v is not None else None, return_type=float)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class Message(BaseModel):
    message: str


class UserBrief(ORM):
    id: int
    email: str
    full_name: str
    role: str


class AuditOut(ORM):
    id: int
    action: str
    entity_type: str
    entity_id: int | None
    event_id: int | None
    details: dict | None
    created_at: datetime
    actor: UserBrief | None = None
