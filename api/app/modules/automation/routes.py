import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User

from .checker import run_checks
from .models import AutomationEvent, WorkflowConfig, WorkflowDelivery
from .schemas import (
    AutomationEventRead,
    CheckResult,
    WorkflowConfigCreate,
    WorkflowConfigRead,
    WorkflowConfigUpdate,
    WorkflowDeliveryRead,
)
from .webhook import dispatch_for_event, retry_delivery

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/automation", tags=["Automation"])


# ── Automation events ─────────────────────────────────────────────────────────

@router.get("/events", response_model=list[AutomationEventRead])
def list_events(
    processed: Annotated[bool | None, Query()] = None,
    severity: Annotated[str | None, Query()] = None,
    event_type: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AutomationEventRead]:
    try:
        q = db.query(AutomationEvent).filter(
            AutomationEvent.tenant_id == current_user.tenant_id
        )
        if processed is True:
            q = q.filter(AutomationEvent.processed_at.isnot(None))
        elif processed is False:
            q = q.filter(AutomationEvent.processed_at.is_(None))
        if severity:
            q = q.filter(AutomationEvent.severity == severity)
        if event_type:
            q = q.filter(AutomationEvent.event_type == event_type)
        rows = q.order_by(AutomationEvent.created_at.desc()).limit(limit).all()
        return [AutomationEventRead.model_validate(r) for r in rows]
    except Exception as exc:
        logger.exception("[packguardian][automation] Failed to list events tenant=%s", current_user.tenant_id)
        raise HTTPException(status_code=500, detail="Failed to list automation events") from exc


@router.post("/check", response_model=CheckResult)
def run_check(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CheckResult:
    """
    Scan all centers and open incidents for trigger conditions.
    Idempotent within the 24-hour dedup window.
    Designed to be called by n8n on a schedule or manually by an operator.
    """
    try:
        new_events, skipped = run_checks(db, current_user.tenant_id)
        db.commit()
        from app.modules.ws.events import automation_triggered
        for event in new_events:
            dispatch_for_event(db, event)
            automation_triggered(current_user.tenant_id,
                                 event_id=event.id, event_type=event.event_type,
                                 severity=event.severity,
                                 center_id=event.payload.get("center_id") if isinstance(event.payload, dict) else None)
        logger.info(
            "[packguardian][automation] Check completed: created=%d skipped=%d tenant=%s",
            len(new_events),
            skipped,
            current_user.tenant_id,
        )
        return CheckResult(created=len(new_events), skipped=skipped)
    except Exception as exc:
        db.rollback()
        logger.exception("[packguardian][automation] Check failed tenant=%s", current_user.tenant_id)
        raise HTTPException(status_code=500, detail="Automation check failed") from exc


@router.patch("/events/{event_id}/process", response_model=AutomationEventRead)
def mark_processed(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AutomationEventRead:
    event = db.query(AutomationEvent).filter(
        AutomationEvent.id == event_id,
        AutomationEvent.tenant_id == current_user.tenant_id,
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    event.processed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)
    return AutomationEventRead.model_validate(event)


# ── Workflow configs ──────────────────────────────────────────────────────────

@router.get("/workflows", response_model=list[WorkflowConfigRead])
def list_workflows(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[WorkflowConfigRead]:
    rows = (
        db.query(WorkflowConfig)
        .filter(WorkflowConfig.tenant_id == current_user.tenant_id)
        .order_by(WorkflowConfig.created_at.asc())
        .all()
    )
    return [WorkflowConfigRead.model_validate(r) for r in rows]


@router.post("/workflows", response_model=WorkflowConfigRead, status_code=status.HTTP_201_CREATED)
def create_workflow(
    payload: WorkflowConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowConfigRead:
    config = WorkflowConfig(
        tenant_id=current_user.tenant_id,
        event_type=payload.event_type,
        workflow_name=payload.workflow_name,
        webhook_url=payload.webhook_url_str(),
        is_enabled=True,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    logger.info(
        "[packguardian][automation] Workflow created: id=%s name=%s event_type=%s tenant=%s",
        config.id,
        config.workflow_name,
        config.event_type,
        current_user.tenant_id,
    )
    return WorkflowConfigRead.model_validate(config)


@router.patch("/workflows/{workflow_id}", response_model=WorkflowConfigRead)
def update_workflow(
    workflow_id: uuid.UUID,
    payload: WorkflowConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowConfigRead:
    config = db.query(WorkflowConfig).filter(
        WorkflowConfig.id == workflow_id,
        WorkflowConfig.tenant_id == current_user.tenant_id,
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if payload.workflow_name is not None:
        config.workflow_name = payload.workflow_name
    url = payload.webhook_url_str()
    if url is not None:
        config.webhook_url = url
    if payload.is_enabled is not None:
        config.is_enabled = payload.is_enabled

    db.commit()
    db.refresh(config)
    return WorkflowConfigRead.model_validate(config)


@router.delete("/workflows/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow(
    workflow_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    config = db.query(WorkflowConfig).filter(
        WorkflowConfig.id == workflow_id,
        WorkflowConfig.tenant_id == current_user.tenant_id,
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="Workflow not found")
    db.delete(config)
    db.commit()
    logger.info(
        "[packguardian][automation] Workflow deleted: id=%s tenant=%s",
        workflow_id,
        current_user.tenant_id,
    )


# ── Delivery logs ─────────────────────────────────────────────────────────────

@router.get("/deliveries", response_model=list[WorkflowDeliveryRead])
def list_deliveries(
    event_id: Annotated[uuid.UUID | None, Query()] = None,
    workflow_id: Annotated[uuid.UUID | None, Query()] = None,
    delivery_status: Annotated[str | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[WorkflowDeliveryRead]:
    q = db.query(WorkflowDelivery).filter(
        WorkflowDelivery.tenant_id == current_user.tenant_id
    )
    if event_id:
        q = q.filter(WorkflowDelivery.event_id == event_id)
    if workflow_id:
        q = q.filter(WorkflowDelivery.workflow_config_id == workflow_id)
    if delivery_status:
        q = q.filter(WorkflowDelivery.status == delivery_status)
    rows = q.order_by(WorkflowDelivery.attempted_at.desc()).limit(limit).all()
    return [WorkflowDeliveryRead.model_validate(r) for r in rows]


@router.post("/deliveries/{delivery_id}/retry", response_model=WorkflowDeliveryRead)
def retry_failed_delivery(
    delivery_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowDeliveryRead:
    delivery = db.query(WorkflowDelivery).filter(
        WorkflowDelivery.id == delivery_id,
        WorkflowDelivery.tenant_id == current_user.tenant_id,
    ).first()
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    try:
        new_delivery = retry_delivery(db, delivery)
        return WorkflowDeliveryRead.model_validate(new_delivery)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[packguardian][automation] Retry failed for delivery=%s", delivery_id)
        raise HTTPException(status_code=500, detail="Retry failed") from exc
