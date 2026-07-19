import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.organizations.access import OrgScope, get_org_scope
from app.modules.organizations.audit import log as audit_log
from app.modules.organizations.models import OrganizationMember
from app.modules.osha.models import Incident

from .models import (
    CASE_PRIORITIES,
    CASE_STATUSES,
    COMMENT_VISIBILITIES,
    CaseTimeline,
    IncidentCase,
    IncidentComment,
    IncidentTask,
)
from .schemas import (
    CaseDetail,
    CaseRead,
    CaseUpdate,
    CommentCreate,
    CommentRead,
    IncidentSummary,
    TaskCreate,
    TaskRead,
    TaskUpdate,
    TimelineRead,
)
from .service import _timeline, update_case
from app.modules.ws import events as ws

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cases", tags=["Cases"])


def _notify_assignment(db, *, tenant_id, user_id, case_id, assigner_email: str) -> None:
    """Emit a case_assigned notification. Silently swallows errors."""
    try:
        from app.modules.notifications.routes import emit
        emit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            notification_type="case_assigned",
            title="Case assigned to you",
            message=f"You have been assigned a case by {assigner_email}",
            resource_type="case",
            resource_id=case_id,
        )
    except Exception:
        pass


def _notify_escalation(db, *, tenant_id, user_id, case_id, level: int) -> None:
    try:
        from app.modules.notifications.routes import emit
        emit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            notification_type="escalated",
            title=f"Case escalated to level {level}",
            message=f"A case you are assigned to has been escalated to level {level}",
            resource_type="case",
            resource_id=case_id,
        )
    except Exception:
        pass

# Management roles that can see management_only comments
_MGMT_ROLES = frozenset({"admin", "center_manager", "district_manager", "area_manager"})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_case_or_404(
    db: Session, case_id: uuid.UUID, tenant_id: uuid.UUID
) -> IncidentCase:
    case = db.query(IncidentCase).filter(
        IncidentCase.id == case_id,
        IncidentCase.tenant_id == tenant_id,
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


def _apply_case_scope(q, scope: OrgScope, tenant_id: uuid.UUID):
    q = q.filter(IncidentCase.tenant_id == tenant_id)
    if scope.accessible_org_ids is not None:
        q = q.filter(IncidentCase.organization_id.in_(scope.accessible_org_ids))
    return q


def _get_user_org_roles(db: Session, user_id: uuid.UUID) -> set[str]:
    """Return all org roles assigned to this user across all orgs."""
    rows = db.query(OrganizationMember.role).filter(
        OrganizationMember.user_id == user_id
    ).all()
    return {r.role for r in rows}


def _can_see_comment(comment: IncidentComment, user: User, user_roles: set[str]) -> bool:
    if comment.visibility == "all":
        return True
    if user.role == "admin":
        return True
    if comment.visibility == "hr_only":
        return "hr" in user_roles
    if comment.visibility == "legal_only":
        return "legal" in user_roles
    if comment.visibility == "management_only":
        return bool(user_roles & _MGMT_ROLES) or user.role == "admin"
    return False


# ── Case list and detail ──────────────────────────────────────────────────────

@router.get("", response_model=list[CaseRead])
def list_cases(
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    priority_filter: Annotated[str | None, Query(alias="priority")] = None,
    escalation_min: Annotated[int, Query(ge=0, le=3)] = 0,
    assigned_to: Annotated[uuid.UUID | None, Query()] = None,
    incident_id: Annotated[uuid.UUID | None, Query()] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> list[CaseRead]:
    try:
        q = _apply_case_scope(db.query(IncidentCase), scope, current_user.tenant_id)
        if status_filter and status_filter in CASE_STATUSES:
            q = q.filter(IncidentCase.status == status_filter)
        if priority_filter and priority_filter in CASE_PRIORITIES:
            q = q.filter(IncidentCase.priority == priority_filter)
        if escalation_min > 0:
            q = q.filter(IncidentCase.escalation_level >= escalation_min)
        if assigned_to:
            q = q.filter(IncidentCase.assigned_to_user_id == assigned_to)
        if incident_id:
            q = q.filter(IncidentCase.incident_id == incident_id)
        rows = (
            q.order_by(IncidentCase.updated_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
        # Enrich each case with incident_type and center_id via a single bulk join
        incident_ids = [r.incident_id for r in rows]
        incident_map: dict[uuid.UUID, Incident] = {}
        if incident_ids:
            incidents = db.query(Incident).filter(
                Incident.id.in_(incident_ids),
                Incident.tenant_id == current_user.tenant_id,
            ).all()
            incident_map = {i.id: i for i in incidents}

        results: list[CaseRead] = []
        for r in rows:
            obj = CaseRead.model_validate(r)
            inc = incident_map.get(r.incident_id)
            if inc:
                obj.incident_type = inc.incident_type
                obj.center_id = inc.center_id
            results.append(obj)
        return results
    except Exception as exc:
        logger.exception("[packguardian][cases] Failed to list cases tenant=%s", current_user.tenant_id)
        raise HTTPException(status_code=500, detail="Failed to list cases") from exc


@router.get("/{case_id}", response_model=CaseDetail)
def get_case(
    case_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> CaseDetail:
    try:
        case = _get_case_or_404(db, case_id, current_user.tenant_id)
        # Scope check
        if scope.accessible_org_ids is not None and case.organization_id not in scope.accessible_org_ids:
            raise HTTPException(status_code=404, detail="Case not found")

        incident = db.query(Incident).filter(Incident.id == case.incident_id).first()
        if not incident:
            raise HTTPException(status_code=404, detail="Linked incident not found")

        tasks = db.query(IncidentTask).filter(
            IncidentTask.case_id == case_id
        ).order_by(IncidentTask.created_at).all()

        user_roles = _get_user_org_roles(db, current_user.id)
        all_comments = db.query(IncidentComment).filter(
            IncidentComment.case_id == case_id
        ).order_by(IncidentComment.created_at).all()
        visible_comments = [c for c in all_comments if _can_see_comment(c, current_user, user_roles)]

        timeline = db.query(CaseTimeline).filter(
            CaseTimeline.case_id == case_id
        ).order_by(CaseTimeline.created_at.desc()).limit(100).all()

        # Audit: incident accessed
        audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
                  action="incident_accessed", resource_type="case",
                  resource_id=case_id,
                  details={"incident_id": str(case.incident_id)})
        db.commit()

        # Evidence count (import here to avoid circular at module level)
        from app.modules.evidence.models import EvidenceFile
        evidence_count = db.query(EvidenceFile).filter(
            EvidenceFile.case_id == case_id
        ).count()

        open_tasks = sum(1 for t in tasks if not t.completed)
        return CaseDetail(
            case=CaseRead.model_validate(case),
            incident=IncidentSummary.model_validate(incident),
            tasks=[TaskRead.model_validate(t) for t in tasks],
            comments=[CommentRead.model_validate(c) for c in visible_comments],
            timeline=[TimelineRead.model_validate(e) for e in timeline],
            task_count=len(tasks),
            open_task_count=open_tasks,
            evidence_count=evidence_count,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[packguardian][cases] Failed to get case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to get case") from exc


@router.patch("/{case_id}", response_model=CaseRead)
def patch_case(
    case_id: uuid.UUID,
    payload: CaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseRead:
    try:
        case = _get_case_or_404(db, case_id, current_user.tenant_id)

        if payload.status and payload.status not in CASE_STATUSES:
            raise HTTPException(status_code=422, detail=f"Invalid status: {payload.status}")
        if payload.priority and payload.priority not in CASE_PRIORITIES:
            raise HTTPException(status_code=422, detail=f"Invalid priority: {payload.priority}")

        prev_assignee = case.assigned_to_user_id
        prev_escalation = case.escalation_level

        update_case(
            db, case, current_user.id,
            status=payload.status,
            priority=payload.priority,
            escalation_level=payload.escalation_level,
            assigned_to_user_id=payload.assigned_to_user_id,
            assigned_role=payload.assigned_role,
            due_date=payload.due_date,
        )
        audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
                  action="incident_modified", resource_type="case",
                  resource_id=case_id,
                  details={k: str(v) for k, v in payload.model_dump(exclude_none=True).items()})

        # Notifications (non-fatal)
        if payload.assigned_to_user_id and payload.assigned_to_user_id != prev_assignee:
            _notify_assignment(
                db, tenant_id=current_user.tenant_id,
                user_id=payload.assigned_to_user_id, case_id=case_id,
                assigner_email=current_user.email,
            )
        if payload.escalation_level and payload.escalation_level > prev_escalation and case.assigned_to_user_id:
            _notify_escalation(
                db, tenant_id=current_user.tenant_id,
                user_id=case.assigned_to_user_id, case_id=case_id,
                level=payload.escalation_level,
            )

        db.commit()
        db.refresh(case)
        # Broadcast (non-fatal — wrapped inside broadcast_sync already)
        if payload.assigned_to_user_id and payload.assigned_to_user_id != prev_assignee:
            ws.case_assigned(current_user.tenant_id, case_id=case_id,
                             incident_id=case.incident_id,
                             assigned_to_user_id=case.assigned_to_user_id,
                             status=case.status)
        if payload.escalation_level and payload.escalation_level > prev_escalation:
            ws.case_escalated(current_user.tenant_id, case_id=case_id,
                              incident_id=case.incident_id,
                              escalation_level=case.escalation_level,
                              priority=case.priority)
        if payload.status and payload.status != case.status:
            ws.case_status_changed(current_user.tenant_id, case_id=case_id,
                                   new_status=case.status, priority=case.priority)
        return CaseRead.model_validate(case)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[packguardian][cases] Failed to update case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to update case") from exc


# ── Tasks ─────────────────────────────────────────────────────────────────────

@router.get("/{case_id}/tasks", response_model=list[TaskRead])
def list_tasks(
    case_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TaskRead]:
    _get_case_or_404(db, case_id, current_user.tenant_id)
    rows = db.query(IncidentTask).filter(
        IncidentTask.case_id == case_id
    ).order_by(IncidentTask.created_at).all()
    return [TaskRead.model_validate(r) for r in rows]


@router.post("/{case_id}/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    case_id: uuid.UUID,
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskRead:
    try:
        case = _get_case_or_404(db, case_id, current_user.tenant_id)
        task = IncidentTask(
            case_id=case_id,
            tenant_id=current_user.tenant_id,
            title=payload.title,
            description=payload.description,
            assigned_to_user_id=payload.assigned_to_user_id,
            due_date=payload.due_date,
        )
        db.add(task)
        db.flush()
        _timeline(db, case_id, current_user.tenant_id, current_user.id,
                  "task_created", {"task_id": str(task.id), "title": payload.title})
        audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
                  action="incident_modified", resource_type="task",
                  resource_id=task.id, details={"op": "create", "title": payload.title})
        db.commit()
        db.refresh(task)
        return TaskRead.model_validate(task)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[packguardian][cases] Failed to create task case=%s", case_id)
        raise HTTPException(status_code=500, detail="Failed to create task") from exc


@router.patch("/{case_id}/tasks/{task_id}", response_model=TaskRead)
def update_task(
    case_id: uuid.UUID,
    task_id: uuid.UUID,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskRead:
    try:
        _get_case_or_404(db, case_id, current_user.tenant_id)
        task = db.query(IncidentTask).filter(
            IncidentTask.id == task_id,
            IncidentTask.case_id == case_id,
        ).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if payload.title is not None:
            task.title = payload.title
        if payload.description is not None:
            task.description = payload.description
        if payload.assigned_to_user_id is not None:
            task.assigned_to_user_id = payload.assigned_to_user_id
        if payload.due_date is not None:
            task.due_date = payload.due_date
        if payload.completed is not None and payload.completed != task.completed:
            task.completed = payload.completed
            task.completed_at = datetime.now(timezone.utc) if payload.completed else None
            _timeline(db, case_id, current_user.tenant_id, current_user.id,
                      "task_completed" if payload.completed else "task_reopened",
                      {"task_id": str(task_id), "title": task.title})
            audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
                      action="incident_modified", resource_type="task",
                      resource_id=task_id,
                      details={"op": "complete" if payload.completed else "reopen", "title": task.title})

        db.commit()
        db.refresh(task)
        if payload.completed is not None:
            ws.task_completed(current_user.tenant_id, task_id=task_id,
                              case_id=case_id, title=task.title,
                              completed=task.completed)
        return TaskRead.model_validate(task)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[packguardian][cases] Failed to update task %s", task_id)
        raise HTTPException(status_code=500, detail="Failed to update task") from exc


# ── Comments ──────────────────────────────────────────────────────────────────

@router.get("/{case_id}/comments", response_model=list[CommentRead])
def list_comments(
    case_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CommentRead]:
    _get_case_or_404(db, case_id, current_user.tenant_id)
    user_roles = _get_user_org_roles(db, current_user.id)
    comments = db.query(IncidentComment).filter(
        IncidentComment.case_id == case_id
    ).order_by(IncidentComment.created_at).all()
    return [CommentRead.model_validate(c) for c in comments if _can_see_comment(c, current_user, user_roles)]


@router.post("/{case_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
def add_comment(
    case_id: uuid.UUID,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CommentRead:
    try:
        case = _get_case_or_404(db, case_id, current_user.tenant_id)
        if payload.visibility not in COMMENT_VISIBILITIES:
            raise HTTPException(status_code=422, detail=f"Invalid visibility: {payload.visibility}")

        comment = IncidentComment(
            case_id=case_id,
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            message=payload.message,
            visibility=payload.visibility,
        )
        db.add(comment)
        db.flush()
        _timeline(db, case_id, current_user.tenant_id, current_user.id,
                  "comment_added",
                  {"comment_id": str(comment.id), "visibility": payload.visibility})
        audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
                  action="incident_modified", resource_type="comment",
                  resource_id=comment.id,
                  details={"op": "add_comment", "visibility": payload.visibility})
        # Move case to investigating if it's still new/assigned
        if case.status in ("new", "assigned"):
            case.status = "investigating"
            case.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(comment)
        ws.comment_added(current_user.tenant_id, comment_id=comment.id,
                         case_id=case_id, user_id=current_user.id,
                         visibility=comment.visibility)
        return CommentRead.model_validate(comment)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[packguardian][cases] Failed to add comment case=%s", case_id)
        raise HTTPException(status_code=500, detail="Failed to add comment") from exc


# ── Timeline ──────────────────────────────────────────────────────────────────

@router.get("/{case_id}/timeline", response_model=list[TimelineRead])
def get_timeline(
    case_id: uuid.UUID,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TimelineRead]:
    _get_case_or_404(db, case_id, current_user.tenant_id)
    rows = db.query(CaseTimeline).filter(
        CaseTimeline.case_id == case_id
    ).order_by(CaseTimeline.created_at.desc()).limit(limit).all()
    return [TimelineRead.model_validate(r) for r in rows]


# ── AI Copilot ────────────────────────────────────────────────────────────────

from pydantic import BaseModel as _BaseModel  # local import keeps top tidy


class CopilotResponse(_BaseModel):
    risk_level: str
    risk_explanation: str
    immediate_actions: list[str]
    osha_implications: str | None
    suggested_next_status: str
    pattern_insight: str | None
    estimated_complexity: str  # simple / moderate / complex


def _osha_note(incident: Incident) -> str | None:
    if incident.recordable:
        parts = ["This incident is OSHA recordable."]
        if incident.days_away:
            parts.append(f"{incident.days_away} day(s) away from work.")
        if incident.restricted_days:
            parts.append(f"{incident.restricted_days} restricted day(s).")
        return " ".join(parts)
    if incident.recordable is False:
        return "Assessed as non-recordable under OSHA 29 CFR 1904."
    return "Recordability not yet assessed — review OSHA fields."


def _suggest_status(case: IncidentCase, incident: Incident) -> str:
    if case.status == "new":
        return "assigned"
    if case.status == "assigned":
        return "investigating"
    if case.status == "investigating":
        if incident.is_finalized:
            return "awaiting_followup"
        return "investigating"
    if case.status == "awaiting_followup":
        return "resolved"
    return case.status


def _complexity(incident: Incident, case: IncidentCase) -> str:
    score = 0
    if incident.risk_score and incident.risk_score >= 70:
        score += 1
    if incident.recordable:
        score += 1
    if case.escalation_level >= 2:
        score += 1
    eff_sev = incident.adjusted_severity or incident.reported_severity
    if eff_sev in ("high", "critical"):
        score += 1
    if score >= 3:
        return "complex"
    if score >= 1:
        return "moderate"
    return "simple"


def _pattern_note(incident: Incident) -> str | None:
    meta = incident.explanation_meta
    if not isinstance(meta, dict):
        return None
    cat_kws = meta.get("category_keywords") or []
    esc_kws = meta.get("escalation_keywords") or []
    parts = []
    if cat_kws:
        parts.append(f"Category signal: {', '.join(cat_kws[:3])}")
    if esc_kws:
        parts.append(f"Escalation triggers: {', '.join(esc_kws[:3])}")
    return ". ".join(parts) if parts else None


@router.get("/{case_id}/copilot", response_model=CopilotResponse)
def get_copilot(
    case_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CopilotResponse:
    case = _get_case_or_404(db, case_id, current_user.tenant_id)
    incident = db.query(Incident).filter(Incident.id == case.incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Linked incident not found")

    eff_sev = incident.adjusted_severity or incident.reported_severity
    risk_score = incident.risk_score or 0
    if risk_score >= 80 or eff_sev == "critical":
        risk_level = "critical"
    elif risk_score >= 55 or eff_sev == "high":
        risk_level = "high"
    elif risk_score >= 30 or eff_sev == "medium":
        risk_level = "medium"
    else:
        risk_level = "low"

    return CopilotResponse(
        risk_level=risk_level,
        risk_explanation=incident.explanation or f"Categorized as {incident.category or 'General'} with a risk score of {risk_score}/100.",
        immediate_actions=(incident.recommendations or [])[:4],
        osha_implications=_osha_note(incident),
        suggested_next_status=_suggest_status(case, incident),
        pattern_insight=_pattern_note(incident),
        estimated_complexity=_complexity(incident, case),
    )


# ── Operational Timeline ──────────────────────────────────────────────────────

from app.modules.evidence.schemas import OperationalEvent  # local import avoids circular


@router.get("/{case_id}/operational-timeline", response_model=list[OperationalEvent])
def get_operational_timeline(
    case_id: uuid.UUID,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OperationalEvent]:
    """
    Merged chronological timeline combining:
      - CaseTimeline workflow events
      - IncidentComment entries (with preview text, visibility-filtered)
      - EvidenceFile uploads
    Sorted oldest → newest for playback.
    """
    _get_case_or_404(db, case_id, current_user.tenant_id)
    user_roles = _get_user_org_roles(db, current_user.id)

    events: list[OperationalEvent] = []

    # 1. CaseTimeline entries
    tl_rows = db.query(CaseTimeline).filter(
        CaseTimeline.case_id == case_id
    ).all()
    for row in tl_rows:
        events.append(OperationalEvent(
            id=str(row.id),
            source="timeline",
            event_type=row.event_type,
            actor_id=str(row.actor_id),
            created_at=row.created_at,
            details=row.details or {},
        ))

    # 2. Comments (visibility-filtered, with preview)
    comments = db.query(IncidentComment).filter(
        IncidentComment.case_id == case_id
    ).all()
    for c in comments:
        if _can_see_comment(c, current_user, user_roles):
            events.append(OperationalEvent(
                id=str(c.id),
                source="comment",
                event_type="comment",
                actor_id=str(c.user_id),
                created_at=c.created_at,
                details={
                    "preview": c.message[:120] + "…" if len(c.message) > 120 else c.message,
                    "visibility": c.visibility,
                },
            ))

    # 3. Evidence files
    from app.modules.evidence.models import EvidenceFile
    evidence_files = db.query(EvidenceFile).filter(
        EvidenceFile.case_id == case_id,
        EvidenceFile.tenant_id == current_user.tenant_id,
    ).all()
    for ef in evidence_files:
        if _can_see_comment(  # reuse visibility logic
            type("_C", (), {"visibility": ef.visibility})(),
            current_user, user_roles
        ):
            events.append(OperationalEvent(
                id=str(ef.id),
                source="evidence",
                event_type="evidence_upload",
                actor_id=str(ef.uploaded_by_user_id),
                created_at=ef.uploaded_at,
                details={
                    "file_id": str(ef.id),
                    "file_name": ef.file_name,
                    "category": ef.category,
                    "file_type": ef.file_type,
                    "visibility": ef.visibility,
                    "ai_processed": ef.ai_processed,
                },
            ))

    # Sort chronologically; apply limit
    events.sort(key=lambda e: e.created_at)
    return events[-limit:]


# ── Investigation Brief ───────────────────────────────────────────────────────

def _extract_recurrence_patterns(
    db: Session, incident, tenant_id, window_days: int = 90
) -> list:
    """
    Lightweight pattern detection for a single incident.
    Finds related incidents sharing entity names (dogs, locations, equipment).
    """
    import re
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
    candidates = db.query(Incident).filter(
        Incident.tenant_id == tenant_id,
        Incident.created_at >= cutoff,
        Incident.id != incident.id,
    ).all()

    desc = (incident.description or "").lower()
    patterns = []

    # 1. Same incident type at same center
    same_type = [i for i in candidates
                 if i.incident_type == incident.incident_type
                 and i.center_id == incident.center_id]
    if len(same_type) >= 1:
        label = incident.incident_type.replace("_", " ")
        patterns.append({
            "pattern_type": "incident_type",
            "label": f"{len(same_type) + 1} {label} incidents at {incident.center_id} in {window_days} days",
            "count": len(same_type) + 1,
            "window_days": window_days,
            "related_incident_ids": [str(i.id) for i in same_type[:5]],
        })

    # 2. Dog names (Capitalized words in context of "dog", "pet", or breed refs)
    dog_names = re.findall(
        r'\b([A-Z][a-z]{2,12})\b(?=.*(?:dog|bite|kennel|play|boarding|conflict|pound))',
        incident.description or "",
        re.IGNORECASE,
    )
    # Also match patterns like "named Max" or "(Max," or "Max ("
    dog_names += re.findall(r'(?:named|called|dog)\s+([A-Z][a-z]{2,12})', incident.description or "")
    _DOG_STOPWORDS = {
        "the", "was", "dog", "had", "her", "his", "and", "but", "not", "she", "him",
        "kennel", "play", "yard", "room", "area", "zone", "bay", "staff", "team",
        "floor", "drain", "door", "gate", "wall", "shed", "cage", "run", "pen",
        "this", "that", "with", "from", "into", "onto", "upon", "both", "each",
        "two", "one", "six", "ten", "four", "five", "nine", "eight", "seven",
        "male", "female", "large", "small", "brown", "black", "white", "gray",
        "left", "right", "upper", "lower", "front", "back", "side", "main",
        "shift", "morning", "evening", "night", "closing", "opening",
        "employee", "worker", "groomer", "manager", "supervisor", "technician",
    }
    dog_names = list({n.title() for n in dog_names if len(n) > 2 and n.lower() not in _DOG_STOPWORDS})

    for name in dog_names[:3]:
        matches = [i for i in candidates
                   if name.lower() in (i.description or "").lower()]
        if len(matches) >= 1:
            patterns.append({
                "pattern_type": "dog_name",
                "label": f"{name} involved in {len(matches) + 1} incidents in {window_days} days",
                "count": len(matches) + 1,
                "window_days": window_days,
                "related_incident_ids": [str(i.id) for i in matches[:5]],
            })

    # 3. Location keywords (drain, dryer, kennel, yard, grooming station)
    location_keywords = re.findall(
        r'\b(drain|dryer|kennel [A-Z0-9-]+|play yard [A-Z0-9]+|yard [A-Z0-9]+|'
        r'grooming (?:station|table|bay)|wash bay|entrance|hallway)\b',
        incident.description or "",
        re.IGNORECASE,
    )
    for loc in list({kw.lower() for kw in location_keywords})[:2]:
        matches = [i for i in candidates
                   if loc in (i.description or "").lower()
                   and i.center_id == incident.center_id]
        if len(matches) >= 1:
            patterns.append({
                "pattern_type": "location",
                "label": f"{len(matches) + 1} incidents near {loc} at {incident.center_id}",
                "count": len(matches) + 1,
                "window_days": window_days,
                "related_incident_ids": [str(i.id) for i in matches[:5]],
            })

    # 4. Same employee name
    if incident.employee_name:
        emp = incident.employee_name.lower()
        matches = [i for i in candidates
                   if i.employee_name and i.employee_name.lower() == emp]
        if len(matches) >= 1:
            patterns.append({
                "pattern_type": "employee",
                "label": f"{incident.employee_name} involved in {len(matches) + 1} incidents in {window_days} days",
                "count": len(matches) + 1,
                "window_days": window_days,
                "related_incident_ids": [str(i.id) for i in matches[:5]],
            })

    return patterns


@router.get("/{case_id}/brief", response_model=dict)
def get_investigation_brief(
    case_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Aggregated operational intelligence for investigation briefing.
    Returns a structured summary: situation, risk, involvement, recurrence, next step.
    """
    from app.modules.corrective_actions.models import CorrectiveAction
    from app.modules.witness.models import WitnessStatement
    from datetime import datetime, timezone

    case = _get_case_or_404(db, case_id, current_user.tenant_id)
    incident = db.query(Incident).filter(Incident.id == case.incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Linked incident not found")

    # Risk data
    eff_sev = incident.adjusted_severity or incident.reported_severity
    risk_score = incident.operational_risk_score or incident.risk_score
    risk_band = getattr(incident, "risk_band", None)
    risk_contributors = getattr(incident, "risk_contributors", None)

    # Headline
    type_label = incident.incident_type.replace("_", " ").title()
    headline_parts = [type_label]
    if incident.employee_name:
        headline_parts.append(f"involving {incident.employee_name}")
    if incident.center_id:
        headline_parts.append(f"at {incident.center_id}")
    severity_word = {"low": "low-severity", "medium": "medium-severity", "high": "high-severity", "critical": "critical"}.get(eff_sev, eff_sev)
    headline = f"{severity_word.capitalize()} {' '.join(headline_parts)}"

    # Corrective actions
    now = datetime.now(timezone.utc)
    cas = db.query(CorrectiveAction).filter(
        CorrectiveAction.case_id == case_id,
        CorrectiveAction.tenant_id == current_user.tenant_id,
    ).all()
    open_cas = [ca for ca in cas if ca.status not in ("completed",)]
    overdue_cas = [ca for ca in open_cas if ca.due_date and ca.due_date.replace(
        tzinfo=timezone.utc if ca.due_date.tzinfo is None else ca.due_date.tzinfo) < now]

    # Witnesses
    witness_count = db.query(WitnessStatement).filter(
        WitnessStatement.case_id == case_id,
        WitnessStatement.tenant_id == current_user.tenant_id,
    ).count()

    # Recurrence patterns
    patterns = _extract_recurrence_patterns(db, incident, current_user.tenant_id)

    # Recommended next step
    if case.status in ("new",):
        next_step = "Assign this case to an investigator to begin review"
    elif case.status in ("assigned", "investigating") and len(open_cas) == 0:
        next_step = "Add corrective actions to track follow-through"
    elif overdue_cas:
        next_step = f"Follow up on {len(overdue_cas)} overdue corrective action(s)"
    elif witness_count == 0 and incident.incident_type in ("dog_bite", "dog_fight", "employee_injury", "chemical", "slip_fall"):
        next_step = "Collect witness statements to complete the investigation"
    elif case.status not in ("resolved", "closed") and len(open_cas) == 0:
        next_step = "Review documentation and mark case resolved when complete"
    elif case.status in ("resolved",):
        next_step = "Case resolved — archive or escalate to OSHA if required"
    else:
        next_step = "Continue investigation and update case status as work progresses"

    return {
        "case_id": str(case_id),
        "headline": headline,
        "severity_effective": eff_sev,
        "risk_score": risk_score,
        "risk_band": risk_band,
        "risk_contributors": risk_contributors,
        "employee_name": incident.employee_name,
        "witness_count": witness_count,
        "open_corrective_action_count": len(open_cas),
        "overdue_corrective_action_count": len(overdue_cas),
        "recurrence_patterns": patterns,
        "osha_review_required": bool(incident.recordable),
        "recommended_next_step": next_step,
    }
