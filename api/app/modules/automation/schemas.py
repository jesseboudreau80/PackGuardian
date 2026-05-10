from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, HttpUrl

EventType = Literal[
    "HIGH_RISK_HOTSPOT",
    "EMERGING_RISK",
    "OSHA_OVERDUE",
    "INCIDENT_FINALIZED",
    "*",
]
Severity = Literal["low", "medium", "high", "critical"]


class AutomationEventRead(BaseModel):
    id: UUID
    tenant_id: UUID
    event_type: str
    severity: str
    payload: dict[str, Any]
    created_at: datetime
    processed_at: datetime | None

    model_config = {"from_attributes": True}


class CheckResult(BaseModel):
    created: int
    skipped: int


# ── Workflow configs ──────────────────────────────────────────────────────────

class WorkflowConfigCreate(BaseModel):
    event_type: EventType
    workflow_name: str
    webhook_url: HttpUrl

    def webhook_url_str(self) -> str:
        return str(self.webhook_url)


class WorkflowConfigUpdate(BaseModel):
    workflow_name: str | None = None
    webhook_url: HttpUrl | None = None
    is_enabled: bool | None = None

    def webhook_url_str(self) -> str | None:
        return str(self.webhook_url) if self.webhook_url else None


class WorkflowConfigRead(BaseModel):
    id: UUID
    tenant_id: UUID
    event_type: str
    workflow_name: str
    webhook_url: str
    is_enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Deliveries ────────────────────────────────────────────────────────────────

class WorkflowDeliveryRead(BaseModel):
    id: UUID
    tenant_id: UUID
    event_id: UUID
    workflow_config_id: UUID
    status: str
    response_code: int | None
    response_body: str | None
    attempted_at: datetime

    model_config = {"from_attributes": True}
