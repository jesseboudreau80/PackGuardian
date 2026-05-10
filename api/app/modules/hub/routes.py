"""
Hub: aggregated data endpoints for the command center and work queue.
No models — queries existing tables.
"""
import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.automation.models import AutomationEvent
from app.modules.cases.models import IncidentCase, IncidentTask
from app.modules.cases.schemas import CaseRead, IncidentSummary, TaskRead
from app.modules.map.models import Center
from app.modules.map.schemas import CenterRead
from app.modules.osha.models import Incident
from app.modules.osha.schemas import IncidentRead
from app.modules.organizations.access import OrgScope, apply_scope, get_org_scope
from app.modules.organizations.models import OrgAuditLog, OrganizationMember

logger = logging.getLogger(__name__)

# ── Shared helpers ────────────────────────────────────────────────────────────

def _case_scope(q, scope: OrgScope, tenant_id):
    q = q.filter(IncidentCase.tenant_id == tenant_id)
    if scope.accessible_org_ids is not None:
        q = q.filter(IncidentCase.organization_id.in_(scope.accessible_org_ids))
    return q


def _user_org_roles(db: Session, user_id) -> set[str]:
    rows = db.query(OrganizationMember.role).filter(
        OrganizationMember.user_id == user_id
    ).all()
    return {r.role for r in rows}


def _role_context(user: User, roles: set[str]) -> str:
    if user.role == "admin":
        return "Admin"
    if "hr" in roles:
        return "HR"
    if "safety" in roles:
        return "Safety"
    if "legal" in roles:
        return "Legal"
    if "benefits" in roles:
        return "Benefits"
    if "area_manager" in roles:
        return "Area Manager"
    if "district_manager" in roles:
        return "District Manager"
    if "center_manager" in roles:
        return "Center Manager"
    if "operations" in roles:
        return "Operations"
    return "Manager"


# ── My Work ───────────────────────────────────────────────────────────────────

class ActivityItem(BaseModel):
    id: str
    actor_id: str
    action: str
    resource_type: str
    resource_id: str | None
    details: dict[str, Any] | None
    created_at: datetime


class MyWorkResponse(BaseModel):
    role_context: str
    assigned_cases: list[CaseRead]
    overdue_tasks: list[TaskRead]
    escalated_cases: list[CaseRead]
    pending_osha_review: list[IncidentSummary]
    open_incidents_count: int
    open_tasks_in_orgs: int
    unread_notifications: int


router_work = APIRouter(prefix="/my-work", tags=["My Work"])


@router_work.get("", response_model=MyWorkResponse)
def get_my_work(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> MyWorkResponse:
    try:
        now = datetime.now(timezone.utc)
        tid = current_user.tenant_id
        uid = current_user.id

        # Cases assigned directly to me (not closed/resolved)
        assigned_cases = (
            db.query(IncidentCase)
            .filter(
                IncidentCase.tenant_id == tid,
                IncidentCase.assigned_to_user_id == uid,
                IncidentCase.status.notin_(["resolved", "closed"]),
            )
            .order_by(IncidentCase.updated_at.desc())
            .limit(20)
            .all()
        )

        # Overdue tasks assigned to me
        overdue_tasks = (
            db.query(IncidentTask)
            .filter(
                IncidentTask.tenant_id == tid,
                IncidentTask.assigned_to_user_id == uid,
                IncidentTask.completed == False,  # noqa: E712
                IncidentTask.due_date <= now,
                IncidentTask.due_date.isnot(None),
            )
            .order_by(IncidentTask.due_date.asc())
            .limit(20)
            .all()
        )

        # Escalated cases in my org scope
        escalated_cases = (
            _case_scope(
                db.query(IncidentCase).filter(
                    IncidentCase.escalation_level >= 1,
                    IncidentCase.status.notin_(["resolved", "closed"]),
                ),
                scope, tid,
            )
            .order_by(IncidentCase.escalation_level.desc())
            .limit(10)
            .all()
        )

        # Pending OSHA review (recordable=null, open) in my scope
        pending_osha = (
            apply_scope(db.query(Incident), scope, tid)
            .filter(Incident.recordable.is_(None), Incident.status == "open")
            .limit(10)
            .all()
        )

        # Open incidents count in my scope
        open_count = (
            apply_scope(db.query(func.count(Incident.id)), scope, tid)
            .filter(Incident.status == "open")
            .scalar()
        ) or 0

        # Open tasks in my orgs
        open_tasks_count = (
            db.query(func.count(IncidentTask.id))
            .filter(IncidentTask.tenant_id == tid, IncidentTask.completed == False)  # noqa: E712
            .scalar()
        ) or 0

        # Unread notification count
        from app.modules.notifications.models import Notification
        unread = (
            db.query(func.count(Notification.id))
            .filter(
                Notification.tenant_id == tid,
                Notification.user_id == uid,
                Notification.is_read == False,  # noqa: E712
            )
            .scalar()
        ) or 0

        roles = _user_org_roles(db, uid)
        return MyWorkResponse(
            role_context=_role_context(current_user, roles),
            assigned_cases=[CaseRead.model_validate(c) for c in assigned_cases],
            overdue_tasks=[TaskRead.model_validate(t) for t in overdue_tasks],
            escalated_cases=[CaseRead.model_validate(c) for c in escalated_cases],
            pending_osha_review=[IncidentSummary.model_validate(i) for i in pending_osha],
            open_incidents_count=open_count,
            open_tasks_in_orgs=open_tasks_count,
            unread_notifications=unread,
        )
    except Exception as exc:
        logger.exception("[packguardian][hub] Failed to build my-work tenant=%s", current_user.tenant_id)
        raise HTTPException(status_code=500, detail="Failed to build work queue") from exc


# ── Command Center ────────────────────────────────────────────────────────────

class AutomationEventSummary(BaseModel):
    id: str
    event_type: str
    severity: str
    payload: dict[str, Any]
    created_at: datetime
    processed_at: datetime | None


class CommandSummary(BaseModel):
    # Risk metrics
    total_incidents: int
    open_incidents: int
    critical_incidents: int
    average_risk_score: int
    # Cases
    open_cases_by_status: dict[str, int]
    escalated_case_count: int
    # Activity
    recent_activity: list[ActivityItem]
    recent_automation_events: list[AutomationEventSummary]
    unprocessed_automation_count: int
    # Escalations
    escalated_cases: list[CaseRead]


router_command = APIRouter(prefix="/command", tags=["Command"])


@router_command.get("/summary", response_model=CommandSummary)
def get_command_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> CommandSummary:
    try:
        tid = current_user.tenant_id

        # Risk overview
        all_incidents = apply_scope(db.query(Incident), scope, tid).all()
        total = len(all_incidents)
        open_count = sum(1 for i in all_incidents if i.status == "open")
        eff = lambda i: i.adjusted_severity or i.reported_severity
        critical_count = sum(1 for i in all_incidents if eff(i) == "critical")
        scored = [i.risk_score for i in all_incidents if i.risk_score is not None]
        avg_risk = round(sum(scored) / len(scored)) if scored else 0

        # Cases by status
        status_rows = (
            _case_scope(
                db.query(IncidentCase.status, func.count(IncidentCase.id))
                .filter(IncidentCase.status.notin_(["closed"]))
                .group_by(IncidentCase.status),
                scope, tid,
            ).all()
        )
        cases_by_status = {s: c for s, c in status_rows}

        # Escalated cases
        escalated = (
            _case_scope(
                db.query(IncidentCase).filter(
                    IncidentCase.escalation_level >= 1,
                    IncidentCase.status.notin_(["resolved", "closed"]),
                ),
                scope, tid,
            )
            .order_by(IncidentCase.escalation_level.desc(), IncidentCase.updated_at.desc())
            .limit(15)
            .all()
        )

        # Recent audit activity
        activity_rows = (
            db.query(OrgAuditLog)
            .filter(OrgAuditLog.tenant_id == tid)
            .order_by(OrgAuditLog.created_at.desc())
            .limit(25)
            .all()
        )

        # Recent automation events
        automation_rows = (
            db.query(AutomationEvent)
            .filter(AutomationEvent.tenant_id == tid)
            .order_by(AutomationEvent.created_at.desc())
            .limit(15)
            .all()
        )

        unprocessed = (
            db.query(func.count(AutomationEvent.id))
            .filter(
                AutomationEvent.tenant_id == tid,
                AutomationEvent.processed_at.is_(None),
            )
            .scalar()
        ) or 0

        return CommandSummary(
            total_incidents=total,
            open_incidents=open_count,
            critical_incidents=critical_count,
            average_risk_score=avg_risk,
            open_cases_by_status=cases_by_status,
            escalated_case_count=len(escalated),
            recent_activity=[
                ActivityItem(
                    id=str(a.id),
                    actor_id=str(a.actor_id),
                    action=a.action,
                    resource_type=a.resource_type,
                    resource_id=str(a.resource_id) if a.resource_id else None,
                    details=a.details,
                    created_at=a.created_at,
                )
                for a in activity_rows
            ],
            recent_automation_events=[
                AutomationEventSummary(
                    id=str(e.id),
                    event_type=e.event_type,
                    severity=e.severity,
                    payload=e.payload,
                    created_at=e.created_at,
                    processed_at=e.processed_at,
                )
                for e in automation_rows
            ],
            unprocessed_automation_count=unprocessed,
            escalated_cases=[CaseRead.model_validate(c) for c in escalated],
        )
    except Exception as exc:
        logger.exception("[packguardian][hub] Command summary failed tenant=%s", current_user.tenant_id)
        raise HTTPException(status_code=500, detail="Failed to build command summary") from exc


# ── Universal Search ──────────────────────────────────────────────────────────

class EvidenceSearchHit(BaseModel):
    file_id: str
    case_id: str
    file_name: str
    category: str
    ai_summary: str | None
    uploaded_at: datetime


class SearchResults(BaseModel):
    query: str
    incidents: list[IncidentSummary]
    cases: list[CaseRead]
    centers: list[CenterRead]
    evidence: list[EvidenceSearchHit]
    total: int


router_search = APIRouter(prefix="/search", tags=["Search"])


@router_search.get("", response_model=SearchResults)
def universal_search(
    q: Annotated[str, Query(min_length=2, max_length=100)],
    types: Annotated[str, Query()] = "incidents,cases,centers",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> SearchResults:
    try:
        tid = current_user.tenant_id
        type_list = {t.strip() for t in types.split(",")}
        term = f"%{q}%"

        incidents: list[Incident] = []
        if "incidents" in type_list:
            incidents = (
                apply_scope(db.query(Incident), scope, tid)
                .filter(
                    or_(
                        Incident.description.ilike(term),
                        Incident.incident_type.ilike(term),
                        Incident.center_id.ilike(term),
                        Incident.category.ilike(term),
                        Incident.employee_name.ilike(term),
                        Incident.job_title.ilike(term),
                    )
                )
                .order_by(Incident.created_at.desc())
                .limit(15)
                .all()
            )

        cases: list[IncidentCase] = []
        if "cases" in type_list and incidents:
            # Cases linked to matching incidents
            incident_ids = [i.id for i in incidents]
            cases = (
                _case_scope(db.query(IncidentCase), scope, tid)
                .filter(IncidentCase.incident_id.in_(incident_ids))
                .limit(15)
                .all()
            )

        centers: list[Center] = []
        if "centers" in type_list:
            centers = (
                db.query(Center)
                .filter(
                    Center.tenant_id == tid,
                    or_(
                        Center.name.ilike(term),
                        Center.center_code.ilike(term),
                        Center.city.ilike(term),
                        Center.state.ilike(term),
                    ),
                )
                .limit(10)
                .all()
            )

        # Evidence text search
        evidence_hits: list[EvidenceSearchHit] = []
        if "evidence" in type_list or types == "incidents,cases,centers":
            try:
                from app.modules.evidence.models import EvidenceFile, EvidenceNote
                from sqlalchemy import join
                ev_rows = (
                    db.query(EvidenceFile, EvidenceNote)
                    .outerjoin(EvidenceNote, EvidenceNote.evidence_file_id == EvidenceFile.id)
                    .filter(
                        EvidenceFile.tenant_id == tid,
                        or_(
                            EvidenceFile.file_name.ilike(term),
                            EvidenceNote.extracted_text.ilike(term),
                            EvidenceNote.ai_summary.ilike(term),
                        ),
                    )
                    .limit(10)
                    .all()
                )
                for ef, note in ev_rows:
                    evidence_hits.append(EvidenceSearchHit(
                        file_id=str(ef.id),
                        case_id=str(ef.case_id),
                        file_name=ef.file_name,
                        category=ef.category,
                        ai_summary=note.ai_summary if note else None,
                        uploaded_at=ef.uploaded_at,
                    ))
            except Exception:
                pass  # evidence module not yet fully initialised

        total = len(incidents) + len(cases) + len(centers) + len(evidence_hits)
        return SearchResults(
            query=q,
            incidents=[IncidentSummary.model_validate(i) for i in incidents],
            cases=[CaseRead.model_validate(c) for c in cases],
            centers=[CenterRead.model_validate(c) for c in centers],
            evidence=evidence_hits,
            total=total,
        )
    except Exception as exc:
        logger.exception("[packguardian][hub] Search failed tenant=%s", current_user.tenant_id)
        raise HTTPException(status_code=500, detail="Search failed") from exc
