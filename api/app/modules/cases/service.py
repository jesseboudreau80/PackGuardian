"""
Case management business logic.
Pure functions — all take an open DB session and commit nothing.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from .models import CaseTimeline, IncidentCase

if TYPE_CHECKING:
    from app.modules.osha.schemas import IncidentRead

_SEVERITY_TO_PRIORITY = {
    "low":      "low",
    "medium":   "medium",
    "high":     "high",
    "critical": "critical",
}


def _timeline(
    db: Session,
    case_id: uuid.UUID,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID,
    event_type: str,
    details: dict | None = None,
) -> None:
    db.add(CaseTimeline(
        case_id=case_id,
        tenant_id=tenant_id,
        actor_id=actor_id,
        event_type=event_type,
        details=details,
    ))


def auto_create_case(
    db: Session,
    incident: "IncidentRead",
    actor_id: uuid.UUID,
    tenant_id: uuid.UUID,
) -> IncidentCase:
    """
    Create a case automatically when an incident is submitted.
    Initial priority mirrors the effective incident severity.
    Caller must flush before calling (incident must have an ID).
    """
    eff_sev = incident.adjusted_severity or incident.reported_severity
    # Handle both Severity enum and str
    sev_str = eff_sev.value if hasattr(eff_sev, "value") else str(eff_sev)
    priority = _SEVERITY_TO_PRIORITY.get(sev_str, "medium")

    org_id = incident.organization_id if hasattr(incident, "organization_id") else None

    case = IncidentCase(
        incident_id=incident.id,
        tenant_id=tenant_id,
        organization_id=org_id,
        status="new",
        priority=priority,
        escalation_level=0,
    )
    db.add(case)
    db.flush()

    _timeline(
        db, case.id, tenant_id, actor_id,
        event_type="case_created",
        details={
            "incident_id": str(incident.id),
            "center_id": incident.center_id,
            "category": incident.category,
            "risk_score": incident.risk_score,
            "priority": priority,
            "severity": sev_str,
        },
    )
    return case


def update_case(
    db: Session,
    case: IncidentCase,
    actor_id: uuid.UUID,
    *,
    status: str | None = None,
    priority: str | None = None,
    escalation_level: int | None = None,
    assigned_to_user_id: uuid.UUID | None = None,
    assigned_role: str | None = None,
    due_date: datetime | None = None,
) -> None:
    """Apply updates to a case and write timeline entries. Caller must commit."""
    if status is not None and status != case.status:
        old_status = case.status
        case.status = status
        event = "closed" if status == "closed" else "status_changed"
        _timeline(db, case.id, case.tenant_id, actor_id, event,
                  {"old_status": old_status, "new_status": status})

    if priority is not None and priority != case.priority:
        old_priority = case.priority
        case.priority = priority
        _timeline(db, case.id, case.tenant_id, actor_id, "priority_changed",
                  {"old_priority": old_priority, "new_priority": priority})

    if escalation_level is not None and escalation_level != case.escalation_level:
        old_level = case.escalation_level
        case.escalation_level = escalation_level
        _timeline(db, case.id, case.tenant_id, actor_id, "escalated",
                  {"old_level": old_level, "new_level": escalation_level})

    if assigned_to_user_id is not None or assigned_role is not None:
        old_user = str(case.assigned_to_user_id) if case.assigned_to_user_id else None
        old_role = case.assigned_role
        if assigned_to_user_id is not None:
            case.assigned_to_user_id = assigned_to_user_id
        if assigned_role is not None:
            case.assigned_role = assigned_role
        if case.status == "new":
            case.status = "assigned"
        _timeline(db, case.id, case.tenant_id, actor_id, "assigned", {
            "old_assigned_user": old_user,
            "new_assigned_user": str(case.assigned_to_user_id) if case.assigned_to_user_id else None,
            "old_role": old_role,
            "new_role": case.assigned_role,
        })

    if due_date is not None:
        case.due_date = due_date

    case.updated_at = datetime.now(timezone.utc)
