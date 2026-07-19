from pydantic import BaseModel, field_validator
from datetime import date, datetime
from typing import Optional
from enum import Enum


class SeverityLevel(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class IncidentBase(BaseModel):
    employee_name: str
    incident_date: date
    description: str
    severity: SeverityLevel

    @field_validator("employee_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Employee name cannot be empty")
        return v.strip()

    @field_validator("description")
    @classmethod
    def description_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Description cannot be empty")
        return v.strip()


class IncidentCreate(IncidentBase):
    pass


class IncidentUpdate(BaseModel):
    employee_name: Optional[str] = None
    incident_date: Optional[date] = None
    description: Optional[str] = None
    severity: Optional[SeverityLevel] = None


class IncidentResponse(IncidentBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}
