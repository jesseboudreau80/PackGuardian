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


# ── Center Health Scoring ─────────────────────────────────────────────────────

def _center_health_score(
    *,
    incidents_30d: list,
    incidents_15d_recent: int,
    incidents_15d_prior: int,
    open_ca: int,
    overdue_ca: int,
    escalated_cases: int,
    last_inspection_score: int | None,
) -> tuple[int, str, str]:
    """
    Returns (health_score 0-100, tier, trend).
    100 = excellent operational health. 0 = critical concern.
    Tier: good | fair | needs_attention | critical
    Trend: improving | stable | declining
    """
    score = 100

    # Incident volume penalty
    for inc in incidents_30d:
        sev = getattr(inc, "adjusted_severity", None) or getattr(inc, "reported_severity", "medium")
        score -= {"critical": 20, "high": 12, "medium": 6, "low": 2}.get(str(sev), 6)

    # Corrective action burden
    score -= open_ca * 4
    score -= overdue_ca * 8

    # Escalation penalty
    score -= escalated_cases * 12

    # Inspection bonus/penalty
    if last_inspection_score is not None:
        if last_inspection_score >= 90:
            score += 5
        elif last_inspection_score < 60:
            score -= 10

    score = max(0, min(100, score))

    # Tier
    if score >= 80:
        tier = "good"
    elif score >= 60:
        tier = "fair"
    elif score >= 40:
        tier = "needs_attention"
    else:
        tier = "critical"

    # Trend: compare last 15d vs prior 15d
    if incidents_15d_recent > incidents_15d_prior + 1:
        trend = "declining"
    elif incidents_15d_prior > incidents_15d_recent + 1:
        trend = "improving"
    else:
        trend = "stable"

    return score, tier, trend


@router_command.get("/center-health", response_model=list[dict])
def get_center_health(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 20,
) -> list[dict]:
    """
    Per-center operational health scores for multi-location visibility.
    Returns centers sorted by health score ascending (most at-risk first).
    """
    from datetime import timedelta
    from app.modules.corrective_actions.models import CorrectiveAction
    from app.modules.inspections.models import Inspection

    tid = current_user.tenant_id
    now = datetime.now(timezone.utc)
    cutoff_30 = now - timedelta(days=30)
    cutoff_15 = now - timedelta(days=15)

    centers = db.query(Center).filter(Center.tenant_id == tid).limit(limit).all()
    results = []

    for center in centers:
        cc = center.center_code

        # Incidents in 30d
        inc_30d = db.query(Incident).filter(
            Incident.tenant_id == tid,
            Incident.center_id == cc,
            Incident.created_at >= cutoff_30,
        ).all()

        inc_15d_recent = sum(1 for i in inc_30d if i.created_at >= cutoff_15)
        inc_15d_prior = len(inc_30d) - inc_15d_recent

        # Avg operational risk score
        scored = [i.operational_risk_score for i in inc_30d if i.operational_risk_score is not None]
        avg_risk = round(sum(scored) / len(scored)) if scored else None

        # Corrective actions via cases linked to center incidents
        center_inc_ids = [i.id for i in inc_30d]
        open_ca = 0
        overdue_ca = 0
        if center_inc_ids:
            cases_q = db.query(IncidentCase).filter(
                IncidentCase.incident_id.in_(center_inc_ids),
                IncidentCase.tenant_id == tid,
            ).all()
            case_ids = [c.id for c in cases_q]
            if case_ids:
                all_cas = db.query(CorrectiveAction).filter(
                    CorrectiveAction.case_id.in_(case_ids),
                    CorrectiveAction.status.notin_(["completed"]),
                ).all()
                open_ca = len(all_cas)
                overdue_ca = sum(1 for ca in all_cas if ca.due_date and ca.due_date.replace(
                    tzinfo=timezone.utc if ca.due_date.tzinfo is None else ca.due_date.tzinfo) < now)

        # Escalated cases
        esc_cases = 0
        if center_inc_ids:
            cases_q = db.query(IncidentCase).filter(
                IncidentCase.incident_id.in_(center_inc_ids),
                IncidentCase.escalation_level >= 1,
                IncidentCase.status.notin_(["resolved", "closed"]),
            ).count()
            esc_cases = cases_q

        # Last inspection score
        last_insp = db.query(Inspection).filter(
            Inspection.center_code == cc,
            Inspection.tenant_id == tid,
        ).order_by(Inspection.created_at.desc()).first()
        last_insp_score = last_insp.score if last_insp else None
        last_insp_date = last_insp.created_at.isoformat() if last_insp else None

        health, tier, trend = _center_health_score(
            incidents_30d=inc_30d,
            incidents_15d_recent=inc_15d_recent,
            incidents_15d_prior=inc_15d_prior,
            open_ca=open_ca,
            overdue_ca=overdue_ca,
            escalated_cases=esc_cases,
            last_inspection_score=last_insp_score,
        )

        results.append({
            "center_code": cc,
            "center_name": center.name,
            "city": center.city,
            "state": center.state,
            "health_score": health,
            "tier": tier,
            "trend": trend,
            "incident_count_30d": len(inc_30d),
            "open_corrective_actions": open_ca,
            "overdue_corrective_actions": overdue_ca,
            "escalated_cases": esc_cases,
            "avg_risk_score": avg_risk,
            "last_inspection_score": last_insp_score,
            "last_inspection_date": last_insp_date,
        })

    # Sort by health score ascending (most at-risk first)
    results.sort(key=lambda x: x["health_score"])
    return results


@router_command.get("/executive-briefing", response_model=dict)
def get_executive_briefing(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> dict:
    """
    Executive-level portfolio summary: risk by center, OSHA exposure, unresolved risks.
    """
    from datetime import timedelta
    from app.modules.corrective_actions.models import CorrectiveAction

    tid = current_user.tenant_id
    now = datetime.now(timezone.utc)
    cutoff_30 = now - timedelta(days=30)
    cutoff_7 = now - timedelta(days=7)

    all_incidents = apply_scope(db.query(Incident), scope, tid).all()
    recent_30 = [i for i in all_incidents if i.created_at >= cutoff_30]
    recent_7 = [i for i in all_incidents if i.created_at >= cutoff_7]

    # Prior week for trend
    cutoff_14 = now - timedelta(days=14)
    prior_7 = [i for i in all_incidents if cutoff_14 <= i.created_at < cutoff_7]

    # Risk band distribution
    bands = {"critical": 0, "high": 0, "elevated": 0, "moderate": 0, "low": 0, "unscored": 0}
    for i in recent_30:
        band = getattr(i, "risk_band", None) or "unscored"
        bands[band] = bands.get(band, 0) + 1

    # OSHA exposure
    recordable = [i for i in all_incidents if i.recordable]
    osha_pending = [i for i in all_incidents if i.recordable and not i.is_finalized]

    # Unresolved high-risk cases
    all_cases = _case_scope(
        db.query(IncidentCase).filter(
            IncidentCase.status.notin_(["resolved", "closed"])
        ), scope, tid
    ).all()
    escalated = [c for c in all_cases if c.escalation_level >= 1]

    # Top unresolved corrective actions (overdue)
    overdue_cas = db.query(CorrectiveAction).filter(
        CorrectiveAction.tenant_id == tid,
        CorrectiveAction.status.notin_(["completed"]),
        CorrectiveAction.due_date < now,
        CorrectiveAction.due_date.isnot(None),
    ).count()

    # Top incident types this month
    type_counts: Counter = Counter(i.incident_type for i in recent_30)
    top_types = [{"type": t.replace("_", " ").title(), "count": c}
                 for t, c in type_counts.most_common(5)]

    # Week-over-week trend
    incident_trend = "up" if len(recent_7) > len(prior_7) else "down" if len(recent_7) < len(prior_7) else "flat"

    # Centers with most incidents
    from collections import defaultdict
    by_center: dict = defaultdict(int)
    for i in recent_30:
        by_center[i.center_id] += 1
    top_centers = [{"center_id": k, "count": v} for k, v in sorted(by_center.items(), key=lambda x: -x[1])[:5]]

    return {
        "generated_at": now.isoformat(),
        "period_days": 30,
        "total_incidents_30d": len(recent_30),
        "total_incidents_7d": len(recent_7),
        "incident_trend_wow": incident_trend,
        "prior_week_count": len(prior_7),
        "risk_band_distribution": bands,
        "osha_recordable_total": len(recordable),
        "osha_pending_finalization": len(osha_pending),
        "open_cases": len(all_cases),
        "escalated_cases": len(escalated),
        "overdue_corrective_actions": overdue_cas,
        "top_incident_types": top_types,
        "top_centers_by_volume": top_centers,
    }


@router_command.get("/command/pilot-metrics")
def get_pilot_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lightweight pilot health metrics for founder/admin visibility."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    from datetime import timedelta
    from app.modules.corrective_actions.models import CorrectiveAction
    from app.modules.signals.models import SafetySignal

    tid = current_user.tenant_id
    now = datetime.now(timezone.utc)
    cutoff_30 = now - timedelta(days=30)
    cutoff_7  = now - timedelta(days=7)

    all_incidents = db.query(Incident).filter(Incident.tenant_id == tid).all()
    recent_30 = [i for i in all_incidents if i.created_at >= cutoff_30]
    recent_7  = [i for i in all_incidents if i.created_at >= cutoff_7]

    # Report completeness — incidents with very short descriptions (proxy for rushed/mobile reports)
    sparse = [i for i in recent_30 if not i.description or len((i.description or "").strip()) < 50]
    sparse_pct = round(len(sparse) / max(len(recent_30), 1) * 100)

    # Missing employee name on employee-type incidents
    employee_types = {"employee_injury", "slip_fall", "chemical", "dog_bite", "grooming"}
    emp_incidents = [i for i in recent_30 if i.incident_type in employee_types]
    missing_name  = [i for i in emp_incidents if not i.employee_name]
    missing_name_pct = round(len(missing_name) / max(len(emp_incidents), 1) * 100)

    # CA health
    all_cas = db.query(CorrectiveAction).filter(CorrectiveAction.tenant_id == tid).all()
    total_cas = len(all_cas)
    completed_cas = len([c for c in all_cas if c.status == "completed"])
    overdue_cas   = len([c for c in all_cas if c.status != "completed"
                         and c.due_date and c.due_date < now])
    ca_completion_pct = round(completed_cas / max(total_cas, 1) * 100)

    # Open unassigned cases
    open_cases = db.query(IncidentCase).filter(
        IncidentCase.tenant_id == tid,
        IncidentCase.status.notin_(["resolved", "closed"]),
    ).all()
    unassigned = [c for c in open_cases if not c.assigned_to_user_id]

    # Active signals
    active_signals = db.query(SafetySignal).filter(
        SafetySignal.tenant_id == tid,
        SafetySignal.is_active == True,
        SafetySignal.is_dismissed == False,
    ).count()

    # Centers active in last 7 days
    active_centers = len({i.center_id for i in recent_7})

    return {
        "generated_at": now.isoformat(),
        "incidents_30d": len(recent_30),
        "incidents_7d": len(recent_7),
        "incidents_total": len(all_incidents),
        "sparse_report_pct": sparse_pct,
        "missing_employee_name_pct": missing_name_pct,
        "ca_total": total_cas,
        "ca_completed": completed_cas,
        "ca_completion_pct": ca_completion_pct,
        "ca_overdue": overdue_cas,
        "open_cases": len(open_cases),
        "unassigned_cases": len(unassigned),
        "active_signals": active_signals,
        "active_centers_7d": active_centers,
    }
