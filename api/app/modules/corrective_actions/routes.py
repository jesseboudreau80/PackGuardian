import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.cases.models import IncidentCase, CaseTimeline
from app.modules.cases.service import _timeline
from app.modules.organizations.audit import log as audit_log

from .models import CA_ROOT_CAUSES, CA_STATUSES, CorrectiveAction
from .schemas import CorrectiveActionCreate, CorrectiveActionRead, CorrectiveActionUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cases/{case_id}/corrective-actions", tags=["Corrective Actions"])


def _get_case_or_404(db: Session, case_id: uuid.UUID, tenant_id: uuid.UUID) -> IncidentCase:
    case = db.query(IncidentCase).filter(
        IncidentCase.id == case_id,
        IncidentCase.tenant_id == tenant_id,
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


def _enrich(ca: CorrectiveAction) -> CorrectiveActionRead:
    now = datetime.now(timezone.utc)
    is_overdue = (
        ca.status not in ("completed", "needs_verification")
        and ca.due_date is not None
        and ca.due_date.replace(tzinfo=timezone.utc if ca.due_date.tzinfo is None else ca.due_date.tzinfo) < now
    )
    r = CorrectiveActionRead.model_validate(ca)
    r.is_overdue = is_overdue
    return r


@router.get("", response_model=list[CorrectiveActionRead])
def list_corrective_actions(
    case_id: uuid.UUID,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CorrectiveActionRead]:
    _get_case_or_404(db, case_id, current_user.tenant_id)
    q = db.query(CorrectiveAction).filter(
        CorrectiveAction.case_id == case_id,
        CorrectiveAction.tenant_id == current_user.tenant_id,
    )
    if status_filter and status_filter in CA_STATUSES:
        q = q.filter(CorrectiveAction.status == status_filter)
    rows = q.order_by(CorrectiveAction.created_at.asc()).all()
    return [_enrich(ca) for ca in rows]


@router.post("", response_model=CorrectiveActionRead, status_code=status.HTTP_201_CREATED)
def create_corrective_action(
    case_id: uuid.UUID,
    payload: CorrectiveActionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CorrectiveActionRead:
    case = _get_case_or_404(db, case_id, current_user.tenant_id)
    if payload.root_cause and payload.root_cause not in CA_ROOT_CAUSES:
        raise HTTPException(status_code=422, detail=f"Invalid root_cause: {payload.root_cause}")

    ca = CorrectiveAction(
        tenant_id=current_user.tenant_id,
        case_id=case_id,
        incident_id=case.incident_id,
        title=payload.title,
        description=payload.description,
        root_cause=payload.root_cause,
        assigned_to_user_id=payload.assigned_to_user_id,
        assigned_to_name=payload.assigned_to_name,
        due_date=payload.due_date,
        notes=payload.notes,
        created_by_user_id=current_user.id,
    )
    db.add(ca)
    db.flush()
    _timeline(db, case_id, current_user.tenant_id, current_user.id,
              "corrective_action_added",
              {"ca_id": str(ca.id), "title": payload.title, "root_cause": payload.root_cause})
    audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
              action="incident_modified", resource_type="corrective_action",
              resource_id=ca.id, details={"op": "create", "title": payload.title})
    try:
        from app.modules.signals.risk_scoring import apply_risk_score
        apply_risk_score(db, case.incident_id, current_user.tenant_id)
    except Exception:
        pass
    db.commit()
    db.refresh(ca)
    logger.info("[ca] created ca=%s case=%s tenant=%s", ca.id, case_id, current_user.tenant_id)
    try:
        from app.services.slack import pg_slack
        pg_slack.corrective_action_created(
            ca_id=ca.id,
            description=payload.title,
            due_date=str(payload.due_date) if payload.due_date else None,
            owner=payload.assigned_to_name or current_user.email,
        )
    except Exception:
        pass
    return _enrich(ca)


@router.patch("/{ca_id}", response_model=CorrectiveActionRead)
def update_corrective_action(
    case_id: uuid.UUID,
    ca_id: uuid.UUID,
    payload: CorrectiveActionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CorrectiveActionRead:
    _get_case_or_404(db, case_id, current_user.tenant_id)
    ca = db.query(CorrectiveAction).filter(
        CorrectiveAction.id == ca_id,
        CorrectiveAction.case_id == case_id,
        CorrectiveAction.tenant_id == current_user.tenant_id,
    ).first()
    if not ca:
        raise HTTPException(status_code=404, detail="Corrective action not found")

    if payload.status and payload.status not in CA_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status: {payload.status}")
    if payload.root_cause and payload.root_cause not in CA_ROOT_CAUSES:
        raise HTTPException(status_code=422, detail=f"Invalid root_cause: {payload.root_cause}")

    prev_status = ca.status
    for field in ("title", "description", "root_cause", "assigned_to_user_id",
                  "assigned_to_name", "status", "due_date", "notes"):
        val = getattr(payload, field, None)
        if val is not None:
            setattr(ca, field, val)

    if payload.status == "completed" and prev_status != "completed":
        ca.completed_at = datetime.now(timezone.utc)
        _timeline(db, case_id, current_user.tenant_id, current_user.id,
                  "corrective_action_completed",
                  {"ca_id": str(ca_id), "title": ca.title})
    elif payload.status == "needs_verification" and prev_status not in ("needs_verification",):
        _timeline(db, case_id, current_user.tenant_id, current_user.id,
                  "corrective_action_needs_verification",
                  {"ca_id": str(ca_id), "title": ca.title})

    ca.updated_at = datetime.now(timezone.utc)
    audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
              action="incident_modified", resource_type="corrective_action",
              resource_id=ca_id, details={"op": "update", "status": payload.status})
    case_obj = db.query(IncidentCase).filter(IncidentCase.id == case_id).first()
    if case_obj:
        try:
            from app.modules.signals.risk_scoring import apply_risk_score
            apply_risk_score(db, case_obj.incident_id, current_user.tenant_id)
        except Exception:
            pass
    db.commit()
    db.refresh(ca)
    return _enrich(ca)


@router.delete("/{ca_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_corrective_action(
    case_id: uuid.UUID,
    ca_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    _get_case_or_404(db, case_id, current_user.tenant_id)
    ca = db.query(CorrectiveAction).filter(
        CorrectiveAction.id == ca_id,
        CorrectiveAction.case_id == case_id,
        CorrectiveAction.tenant_id == current_user.tenant_id,
    ).first()
    if not ca:
        raise HTTPException(status_code=404, detail="Corrective action not found")
    if ca.created_by_user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the creator or admin can delete")
    db.delete(ca)
    db.commit()
