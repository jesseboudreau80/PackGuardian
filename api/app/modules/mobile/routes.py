"""
Mobile-optimised aggregated endpoints.
Returns smaller, flatter payloads designed for narrow mobile screens.
"""
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.cases.models import IncidentCase, IncidentTask
from app.modules.inspections.models import Inspection
from app.modules.notifications.models import Notification
from app.modules.organizations.access import OrgScope, get_org_scope
from app.modules.organizations.models import OrganizationMember
from app.modules.osha.models import Incident

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mobile", tags=["Mobile"])


def _user_org_roles(db: Session, user_id) -> set[str]:
    rows = db.query(OrganizationMember.role).filter(
        OrganizationMember.user_id == user_id
    ).all()
    return {r.role for r in rows}


def _role_context(user: User, roles: set[str]) -> str:
    if user.role == "admin":
        return "Admin"
    for r, label in [
        ("safety", "Safety"), ("hr", "HR"), ("legal", "Legal"),
        ("benefits", "Benefits"), ("area_manager", "Area Manager"),
        ("district_manager", "District Manager"), ("center_manager", "Center Manager"),
        ("operations", "Operations"),
    ]:
        if r in roles:
            return label
    return "Manager"


class ShiftAlert(BaseModel):
    type: str
    title: str
    body: str
    resource_id: str | None = None
    severity: str = "medium"


class MyShiftResponse(BaseModel):
    role_context: str
    # Counts
    assigned_case_count: int
    overdue_task_count: int
    active_incident_count: int
    pending_inspection_count: int
    unread_notification_count: int
    # Urgent items (max 5 each for mobile)
    urgent_cases: list[dict[str, Any]]
    my_tasks: list[dict[str, Any]]
    alerts: list[ShiftAlert]


@router.get("/my-shift", response_model=MyShiftResponse)
def get_my_shift(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> MyShiftResponse:
    try:
        now = datetime.now(timezone.utc)
        tid = current_user.tenant_id
        uid = current_user.id

        roles = _user_org_roles(db, uid)

        # ── Counts ──────────────────────────────────────────────────────────
        assigned_case_count = db.query(func.count(IncidentCase.id)).filter(
            IncidentCase.tenant_id == tid,
            IncidentCase.assigned_to_user_id == uid,
            IncidentCase.status.notin_(["resolved", "closed"]),
        ).scalar() or 0

        overdue_task_count = db.query(func.count(IncidentTask.id)).filter(
            IncidentTask.tenant_id == tid,
            IncidentTask.assigned_to_user_id == uid,
            IncidentTask.completed == False,  # noqa: E712
            IncidentTask.due_date <= now,
            IncidentTask.due_date.isnot(None),
        ).scalar() or 0

        active_incident_count = db.query(func.count(Incident.id)).filter(
            Incident.tenant_id == tid,
            Incident.status == "open",
        ).scalar() or 0

        pending_inspection_count = db.query(func.count(Inspection.id)).filter(
            Inspection.tenant_id == tid,
            Inspection.status == "in_progress",
        ).scalar() or 0

        unread_notification_count = db.query(func.count(Notification.id)).filter(
            Notification.tenant_id == tid,
            Notification.user_id == uid,
            Notification.is_read == False,  # noqa: E712
        ).scalar() or 0

        # ── Urgent cases (assigned to me, highest priority first) ───────────
        _PRIORITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        raw_cases = (
            db.query(IncidentCase)
            .filter(
                IncidentCase.tenant_id == tid,
                IncidentCase.assigned_to_user_id == uid,
                IncidentCase.status.notin_(["resolved", "closed"]),
            )
            .limit(10)
            .all()
        )
        raw_cases.sort(
            key=lambda c: (_PRIORITY_ORDER.get(c.priority, 9), -(c.escalation_level or 0))
        )
        urgent_cases = [
            {
                "id": str(c.id),
                "incident_id": str(c.incident_id),
                "status": c.status,
                "priority": c.priority,
                "escalation_level": c.escalation_level,
                "due_date": c.due_date.isoformat() if c.due_date else None,
            }
            for c in raw_cases[:5]
        ]

        # ── My tasks (soonest due) ─────────────────────────────────────────
        raw_tasks = (
            db.query(IncidentTask)
            .filter(
                IncidentTask.tenant_id == tid,
                IncidentTask.assigned_to_user_id == uid,
                IncidentTask.completed == False,  # noqa: E712
            )
            .order_by(IncidentTask.due_date.asc().nulls_last())
            .limit(5)
            .all()
        )
        my_tasks = [
            {
                "id": str(t.id),
                "case_id": str(t.case_id),
                "title": t.title,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "overdue": bool(t.due_date and t.due_date <= now),
            }
            for t in raw_tasks
        ]

        # ── Alerts ────────────────────────────────────────────────────────
        alerts: list[ShiftAlert] = []

        # Escalated cases
        escalated = (
            db.query(IncidentCase)
            .filter(
                IncidentCase.tenant_id == tid,
                IncidentCase.escalation_level >= 2,
                IncidentCase.status.notin_(["resolved", "closed"]),
            )
            .limit(3)
            .all()
        )
        for c in escalated:
            alerts.append(ShiftAlert(
                type="escalation",
                title=f"Level {c.escalation_level} Escalation",
                body=f"Case requires immediate attention",
                resource_id=str(c.id),
                severity="critical" if c.escalation_level >= 3 else "high",
            ))

        if overdue_task_count > 0:
            alerts.append(ShiftAlert(
                type="overdue",
                title=f"{overdue_task_count} Overdue Task{'s' if overdue_task_count != 1 else ''}",
                body="Review and complete overdue items",
                severity="high",
            ))

        return MyShiftResponse(
            role_context=_role_context(current_user, roles),
            assigned_case_count=assigned_case_count,
            overdue_task_count=overdue_task_count,
            active_incident_count=active_incident_count,
            pending_inspection_count=pending_inspection_count,
            unread_notification_count=unread_notification_count,
            urgent_cases=urgent_cases,
            my_tasks=my_tasks,
            alerts=alerts,
        )
    except Exception as exc:
        logger.exception("[mobile] my-shift failed user=%s", current_user.id)
        raise HTTPException(status_code=500, detail="Failed to load shift data") from exc
