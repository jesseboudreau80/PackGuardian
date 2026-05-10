from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class EvidenceNoteRead(BaseModel):
    id: UUID
    evidence_file_id: UUID
    extracted_text: str | None
    ai_summary: str | None
    ai_tags: list[str] | None
    ai_risk_signals: list[dict[str, Any]] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EvidenceFileRead(BaseModel):
    id: UUID
    tenant_id: UUID
    case_id: UUID
    incident_id: UUID | None
    uploaded_by_user_id: UUID
    file_name: str
    file_type: str
    file_size: int
    category: str
    visibility: str
    ai_processed: bool
    uploaded_at: datetime
    note: EvidenceNoteRead | None = None

    model_config = {"from_attributes": True}


class OperationalEvent(BaseModel):
    """Unified event for the operational timeline — merges timeline + comments + evidence."""
    id: str
    source: str          # "timeline" | "comment" | "evidence"
    event_type: str
    actor_id: str | None
    created_at: datetime
    details: dict[str, Any]
