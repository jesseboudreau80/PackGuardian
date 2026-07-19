from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel

CaseStatus = Literal[
    "new", "assigned", "investigating", "awaiting_followup", "resolved", "closed"
]
CasePriority = Literal["low", "medium", "high", "critical"]
CommentVisibility = Literal["all", "hr_only", "legal_only", "management_only"]


# ── Cases ─────────────────────────────────────────────────────────────────────

class CaseUpdate(BaseModel):
    status: CaseStatus | None = None
    priority: CasePriority | None = None
    escalation_level: int | None = None
    assigned_to_user_id: UUID | None = None
    assigned_role: str | None = None
    due_date: datetime | None = None


class CaseRead(BaseModel):
    id: UUID
    incident_id: UUID
    tenant_id: UUID
    organization_id: UUID | None
    assigned_to_user_id: UUID | None
    assigned_role: str | None
    status: str
    priority: str
    escalation_level: int
    due_date: datetime | None
    created_at: datetime
    updated_at: datetime
    # Denormalized from incident for list display — None when join unavailable
    incident_type: str | None = None
    center_id: str | None = None

    model_config = {"from_attributes": True}


class IncidentSummary(BaseModel):
    """Incident info embedded in case responses."""
    id: UUID
    center_id: str
    incident_type: str
    reported_severity: str
    adjusted_severity: str | None
    category: str | None
    risk_score: int | None
    operational_risk_score: int | None = None
    risk_band: str | None = None
    risk_contributors: dict | None = None
    status: str
    recordable: bool | None
    created_at: datetime
    description: str | None = None
    explanation: str | None = None
    employee_name: str | None = None
    body_part: str | None = None
    treatment_type: str | None = None

    model_config = {"from_attributes": True}


class RecurrencePattern(BaseModel):
    """A detected operational pattern related to an incident."""
    pattern_type: str        # dog_name | location | incident_type | equipment | employee
    label: str               # human-readable description
    count: int
    window_days: int
    related_incident_ids: list[str]


class InvestigationBrief(BaseModel):
    """Aggregated operational intelligence for a case investigation."""
    case_id: UUID
    # Situation
    headline: str            # one-sentence what/where/severity
    severity_effective: str
    risk_score: int | None
    risk_band: str | None
    risk_contributors: dict | None
    # Involvement
    employee_name: str | None
    witness_count: int
    # Actions
    open_corrective_action_count: int
    overdue_corrective_action_count: int
    # Recurrence
    recurrence_patterns: list[RecurrencePattern]
    # OSHA
    osha_review_required: bool
    # Status
    recommended_next_step: str


class CaseDetail(BaseModel):
    """Full case with embedded incident, tasks, comments, timeline."""
    case: CaseRead
    incident: IncidentSummary
    tasks: list["TaskRead"]
    comments: list["CommentRead"]
    timeline: list["TimelineRead"]
    task_count: int
    open_task_count: int
    evidence_count: int = 0


# ── Tasks ─────────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    assigned_to_user_id: UUID | None = None
    due_date: datetime | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    assigned_to_user_id: UUID | None = None
    due_date: datetime | None = None
    completed: bool | None = None


class TaskRead(BaseModel):
    id: UUID
    case_id: UUID
    tenant_id: UUID
    title: str
    description: str | None
    assigned_to_user_id: UUID | None
    completed: bool
    completed_at: datetime | None
    due_date: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Comments ──────────────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    message: str
    visibility: CommentVisibility = "all"


class CommentRead(BaseModel):
    id: UUID
    case_id: UUID
    user_id: UUID
    message: str
    visibility: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Timeline ──────────────────────────────────────────────────────────────────

class TimelineRead(BaseModel):
    id: UUID
    case_id: UUID
    actor_id: UUID
    event_type: str
    details: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}
