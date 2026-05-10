from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

Theme = Literal["light", "dark"]


class TenantRead(BaseModel):
    id: UUID
    name: str
    logo_url: str | None
    primary_color: str
    secondary_color: str | None
    theme: Theme
    support_email: str
    support_phone: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TenantUpdate(BaseModel):
    """All fields optional — PATCH semantics via PUT."""
    name: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    theme: Theme | None = None
    support_email: str | None = None
    support_phone: str | None = None


class ThemeUpdate(BaseModel):
    theme: Theme
