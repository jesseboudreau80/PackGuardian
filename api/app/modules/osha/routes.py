import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.automation.events import emit_incident_finalized
from app.modules.automation.webhook import dispatch_for_event
from app.modules.cases.service import auto_create_case
from app.modules.organizations.access import OrgScope, apply_scope, get_org_scope
from app.modules.ws import events as ws
from app.modules.organizations.audit import log as audit_log

from .models import Incident
from .schemas import FinalizeRequest, IncidentCreate, IncidentOshaUpdate, IncidentRead
from .service import (
    IncidentFinalizedError,
    create_incident,
    finalize_incident,
    list_incidents,
    update_incident_osha,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/incidents", tags=["OSHA"])


@router.post("", response_model=IncidentRead, status_code=201)
def post_incident(
    payload: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IncidentRead:
    try:
        result = create_incident(db, payload, current_user.tenant_id)
        audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
                  action="incident_modified", resource_type="incident",
                  resource_id=result.id,
                  details={"op": "create", "center_id": result.center_id,
                           "organization_id": str(result.organization_id) if result.organization_id else None})
        # Automatically create a linked case for every new incident
        try:
            auto_create_case(db, result, current_user.id, current_user.tenant_id)
        except Exception:
            logger.warning("Failed to auto-create case for incident %s — continuing", result.id)
        db.commit()
        sev = result.reported_severity.value if hasattr(result.reported_severity, "value") else str(result.reported_severity)
        ws.incident_created(current_user.tenant_id,
                            incident_id=result.id, center_id=result.center_id,
                            severity=sev, category=result.category,
                            risk_score=result.risk_score)
        return result
    except Exception as exc:
        logger.exception("Failed to create incident")
        raise HTTPException(status_code=500, detail="Failed to create incident") from exc


@router.get("", response_model=list[IncidentRead])
def get_incidents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> list[IncidentRead]:
    try:
        rows = (
            apply_scope(db.query(Incident), scope, current_user.tenant_id)
            .order_by(Incident.created_at.desc())
            .all()
        )
        return [IncidentRead.model_validate(r) for r in rows]
    except Exception as exc:
        logger.exception("Failed to fetch incidents")
        raise HTTPException(status_code=500, detail="Failed to fetch incidents") from exc


@router.patch("/{incident_id}", response_model=IncidentRead)
def patch_incident_osha(
    incident_id: UUID,
    payload: IncidentOshaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IncidentRead:
    try:
        result = update_incident_osha(db, incident_id, payload, current_user.tenant_id)
        audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
                  action="incident_modified", resource_type="incident",
                  resource_id=incident_id,
                  details={"op": "osha_update", "fields": [k for k, v in payload.model_dump(exclude={"changed_by"}).items() if v is not None]})
        db.commit()
        return result
    except IncidentFinalizedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to update OSHA fields for %s", incident_id)
        raise HTTPException(status_code=500, detail="Failed to update incident") from exc


@router.post("/{incident_id}/finalize", response_model=IncidentRead)
def post_finalize(
    incident_id: UUID,
    payload: FinalizeRequest = FinalizeRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IncidentRead:
    try:
        result = finalize_incident(db, incident_id, payload, current_user.tenant_id)
        audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
                  action="incident_modified", resource_type="incident",
                  resource_id=incident_id,
                  details={"op": "finalize", "finalized_by": payload.finalized_by})
        db.commit()
        # Emit automation event — non-fatal
        try:
            event = emit_incident_finalized(db, result, current_user.tenant_id, payload.finalized_by)
            db.commit()
            dispatch_for_event(db, event)
        except Exception:
            logger.warning("Failed to emit/dispatch INCIDENT_FINALIZED event for %s", incident_id)
        return result
    except IncidentFinalizedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to finalize incident %s", incident_id)
        raise HTTPException(status_code=500, detail="Failed to finalize incident") from exc
