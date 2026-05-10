from datetime import date, datetime
from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class IncidentStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    closed = "closed"


class TreatmentType(str, Enum):
    first_aid = "first_aid"
    medical = "medical"
    emergency_room = "emergency_room"
    hospitalization = "hospitalization"


class AuditEntry(BaseModel):
    id: UUID
    incident_id: UUID
    field_name: str
    old_value: str | None
    new_value: str | None
    changed_at: datetime
    changed_by: str | None

    model_config = {"from_attributes": True}


class IncidentOshaUpdate(BaseModel):
    """PATCH body for updating OSHA fields. Audited fields are logged on every change."""
    employee_name: str | None = None
    job_title: str | None = None
    date_of_injury: date | None = None
    time_of_injury: str | None = None
    body_part: str | None = None
    treatment_type: TreatmentType | None = None
    days_away: int | None = None
    restricted_days: int | None = None
    # Optional: override computed recordability; if omitted, system recomputes it.
    recordable: bool | None = None
    changed_by: str | None = None


class FinalizeRequest(BaseModel):
    """Optional body for POST /incidents/{id}/finalize."""
    finalized_by: str | None = None


class ExplanationMeta(BaseModel):
    category_keywords: list[str]
    escalation_keywords: list[str]
    original_severity: str
    adjusted_severity: str


class IncidentCreate(BaseModel):
    center_id: str
    incident_type: str
    description: str
    reported_severity: Severity
    status: IncidentStatus = IncidentStatus.open
    # Optional org assignment — set to scope this incident to a specific org node
    organization_id: UUID | None = None
    # OSHA fields — all optional at creation time
    employee_name: str | None = None
    job_title: str | None = None
    date_of_injury: date | None = None
    time_of_injury: str | None = None
    body_part: str | None = None
    treatment_type: TreatmentType | None = None
    days_away: int | None = None
    restricted_days: int | None = None


class IncidentRead(BaseModel):
    id: UUID
    center_id: str
    incident_type: str
    description: str
    reported_severity: Severity
    adjusted_severity: Severity | None = None
    status: IncidentStatus
    created_at: datetime
    category: str | None = None
    risk_score: int | None = None
    recommendations: list[str] | None = None
    explanation: str | None = None
    explanation_meta: ExplanationMeta | None = None
    # OSHA fields
    employee_name: str | None = None
    job_title: str | None = None
    date_of_injury: date | None = None
    time_of_injury: str | None = None
    body_part: str | None = None
    treatment_type: str | None = None
    days_away: int | None = None
    restricted_days: int | None = None
    recordable: bool | None = None
    is_finalized: bool = False
    organization_id: UUID | None = None

    model_config = {"from_attributes": True}


class CategoryCount(BaseModel):
    category: str
    count: int


class DashboardSummary(BaseModel):
    total_incidents: int
    open_incidents: int
    critical_incidents: int
    average_risk_score: int
    top_risk_categories: list[CategoryCount]


# ── Pattern analysis ──────────────────────────────────────────────────────────

class KeywordCount(BaseModel):
    keyword: str
    count: int


class SeverityTransition(BaseModel):
    from_severity: str
    to_severity: str
    count: int


class KeywordCluster(BaseModel):
    keyword: str
    incident_count: int
    categories: list[str]


class RecommendedAction(BaseModel):
    action: str
    confidence: float  # 0.0–1.0, based on keyword frequency relative to total incidents
    priority: Literal["low", "medium", "high"]


class EmergingRisk(BaseModel):
    keyword: str
    trend: Literal["increasing", "stable", "decreasing"]
    risk_level: Literal["low", "medium", "high"]


class PatternAnalysis(BaseModel):
    top_category_keywords: list[KeywordCount]
    top_escalation_keywords: list[KeywordCount]
    severity_transitions: list[SeverityTransition]
    keyword_clusters: list[KeywordCluster]
    summary: str
    recommended_actions: list[RecommendedAction]
    emerging_risks: list[EmergingRisk]


# ── OSHA reporting forms ──────────────────────────────────────────────────────

class Form301(BaseModel):
    """OSHA Form 301 — Injury and Illness Incident Report (one per incident)."""
    incident_id: UUID
    case_number: int | None
    employee_name: str | None
    job_title: str | None
    center_id: str
    date_of_injury: date | None
    time_of_injury: str | None
    incident_type: str
    body_part: str | None
    description: str
    treatment_type: str | None
    days_away: int
    restricted_days: int
    recordable: bool
    created_at: datetime


class Form300Entry(BaseModel):
    """One row in OSHA Form 300 — Log of Work-Related Injuries and Illnesses."""
    case_number: int
    employee_name: str | None
    job_title: str | None
    date_of_injury: date | None
    incident_type: str
    body_part: str | None
    days_away: int
    restricted_days: int
    classification: Literal["days_away", "restricted", "other"]
    incident_id: UUID


class Form300Log(BaseModel):
    year: int
    center_id: str | None
    entries: list[Form300Entry]
    total_cases: int


class Form300ASummary(BaseModel):
    """OSHA Form 300A — Summary of Work-Related Injuries and Illnesses."""
    year: int
    center_id: str | None
    total_cases: int
    days_away_cases: int
    restricted_cases: int
    other_cases: int
    total_days_away: int
    total_restricted_days: int
