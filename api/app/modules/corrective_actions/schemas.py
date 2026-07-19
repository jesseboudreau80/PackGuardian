from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class CorrectiveActionCreate(BaseModel):
    title: str
    description: Optional[str] = None
    root_cause: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    assigned_to_name: Optional[str] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None


class CorrectiveActionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    root_cause: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    assigned_to_name: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None


class CorrectiveActionRead(BaseModel):
    id: UUID
    tenant_id: UUID
    case_id: UUID
    incident_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    root_cause: Optional[str] = None
    assigned_to_user_id: Optional[UUID] = None
    assigned_to_name: Optional[str] = None
    status: str
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    verified_by_user_id: Optional[UUID] = None
    notes: Optional[str] = None
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime
    is_overdue: bool = False

    model_config = {"from_attributes": True}
