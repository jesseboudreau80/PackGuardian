from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class CenterCreate(BaseModel):
    center_code: str
    name: str
    latitude: float
    longitude: float
    address: str | None = None
    city: str | None = None
    state: str | None = None


class CenterRead(BaseModel):
    id: UUID
    tenant_id: UUID
    center_code: str
    name: str
    latitude: float
    longitude: float
    address: str | None
    city: str | None
    state: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CenterHeat(BaseModel):
    center_id: str          # = center_code, matches Incident.center_id
    name: str
    lat: float
    lng: float
    incident_count: int
    avg_risk_score: float
    heat_score: float       # 0–100, weighted composite
    emerging_risk_level: Literal["low", "medium", "high"]
    trend_velocity: float   # +N = N× more than baseline, -N = decreasing
    top_drivers: list[str]
    recommended_actions: list[str]
    osha_recordable_count: int
