from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class WitnessStatementCreate(BaseModel):
    witness_name: str
    witness_role: Optional[str] = None
    shift_at_time: Optional[str] = None
    observed_directly: bool = True
    intervention_attempted: bool = False
    statement: str
    statement_timestamp: Optional[datetime] = None


class WitnessStatementRead(BaseModel):
    id: UUID
    tenant_id: UUID
    case_id: UUID
    incident_id: Optional[UUID] = None
    witness_name: str
    witness_role: Optional[str] = None
    shift_at_time: Optional[str] = None
    observed_directly: bool
    intervention_attempted: bool
    statement: str
    ai_summary: Optional[str] = None
    recorded_by_user_id: UUID
    statement_timestamp: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class WitnessAISummary(BaseModel):
    """Aggregated AI synthesis across multiple statements."""
    statement_count: int
    common_sequence: str
    discrepancies: list[str]
    likely_triggers: list[str]
    missing_information: list[str]
    engine: str
