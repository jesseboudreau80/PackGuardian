import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User

from .models import QR_TARGET_TYPES, QRCode

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/qr", tags=["QR"])


class QRCreate(BaseModel):
    target_type: str = "general"
    target_name: str
    center_code: str | None = None
    target_metadata: dict[str, Any] | None = None


class QRRead(BaseModel):
    id: uuid.UUID
    code: str
    target_type: str
    target_name: str
    center_code: str | None
    target_metadata: dict[str, Any] | None
    scan_url: str           # full URL to embed in QR image
    created_at: str

    model_config = {"from_attributes": True}


def _read(qr: QRCode, base_url: str) -> QRRead:
    return QRRead(
        id=qr.id,
        code=qr.code,
        target_type=qr.target_type,
        target_name=qr.target_name,
        center_code=qr.center_code,
        target_metadata=qr.target_metadata,
        scan_url=f"{base_url}/mobile/scan?code={qr.code}",
        created_at=qr.created_at.isoformat(),
    )


def _base_url() -> str:
    origins = settings.cors_origins
    return origins[0].rstrip("/") if origins else "https://packguardian.app"


@router.get("", response_model=list[QRRead])
def list_qr(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[QRRead]:
    rows = (
        db.query(QRCode)
        .filter(QRCode.tenant_id == current_user.tenant_id)
        .order_by(QRCode.created_at.desc())
        .all()
    )
    base = _base_url()
    return [_read(r, base) for r in rows]


@router.post("", response_model=QRRead, status_code=status.HTTP_201_CREATED)
def create_qr(
    payload: QRCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QRRead:
    if payload.target_type not in QR_TARGET_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid target_type: {payload.target_type}")
    qr = QRCode(
        tenant_id=current_user.tenant_id,
        target_type=payload.target_type,
        target_name=payload.target_name,
        center_code=payload.center_code,
        target_metadata=payload.target_metadata,
        created_by_user_id=current_user.id,
    )
    db.add(qr)
    db.commit()
    db.refresh(qr)
    logger.info("[packguardian][qr] Created code=%s tenant=%s", qr.code, current_user.tenant_id)
    return _read(qr, _base_url())


@router.get("/lookup/{code}", response_model=QRRead)
def lookup_qr(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QRRead:
    """Resolve a scanned code to its metadata. Used by the mobile scanner."""
    qr = db.query(QRCode).filter(
        QRCode.code == code,
        QRCode.tenant_id == current_user.tenant_id,
    ).first()
    if not qr:
        raise HTTPException(status_code=404, detail="QR code not found")
    return _read(qr, _base_url())


class AssetContext(BaseModel):
    """Operational context returned when scanning a QR code — recent incidents, open actions."""
    qr: QRRead
    recent_incidents: list[dict]
    open_corrective_actions: int
    last_inspection: str | None
    safety_notes: list[str]
    signal_count: int


@router.get("/context/{code}", response_model=AssetContext)
def asset_context(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssetContext:
    """
    Full operational context for a scanned QR code.
    Returns recent incidents, open corrective actions, inspection history, and safety signals.
    """
    qr = db.query(QRCode).filter(
        QRCode.code == code,
        QRCode.tenant_id == current_user.tenant_id,
    ).first()
    if not qr:
        raise HTTPException(status_code=404, detail="QR code not found")

    from datetime import datetime, timedelta, timezone
    from app.modules.osha.models import Incident
    from app.modules.corrective_actions.models import CorrectiveAction
    from app.modules.cases.models import IncidentCase
    from app.modules.inspections.models import Inspection
    from app.modules.signals.models import SafetySignal

    cutoff_30 = datetime.now(timezone.utc) - timedelta(days=30)

    # Match by center_code or target_name as center_id
    center_ref = qr.center_code or qr.target_name

    recent_incs = db.query(Incident).filter(
        Incident.tenant_id == current_user.tenant_id,
        Incident.center_id == center_ref,
        Incident.created_at >= cutoff_30,
    ).order_by(Incident.created_at.desc()).limit(5).all()

    recent_list = [
        {
            "id": str(i.id),
            "type": i.incident_type.replace("_", " ").title(),
            "severity": i.adjusted_severity or i.reported_severity,
            "status": i.status,
            "created_at": i.created_at.isoformat(),
        }
        for i in recent_incs
    ]

    # Open corrective actions via cases linked to incidents at this center
    incident_ids = [i.id for i in recent_incs]
    open_ca = 0
    if incident_ids:
        cases = db.query(IncidentCase).filter(
            IncidentCase.incident_id.in_(incident_ids),
            IncidentCase.tenant_id == current_user.tenant_id,
        ).all()
        case_ids = [c.id for c in cases]
        if case_ids:
            open_ca = db.query(CorrectiveAction).filter(
                CorrectiveAction.case_id.in_(case_ids),
                CorrectiveAction.status.notin_(["completed"]),
            ).count()

    # Last inspection for this center
    last_insp = db.query(Inspection).filter(
        Inspection.center_code == center_ref,
        Inspection.tenant_id == current_user.tenant_id,
    ).order_by(Inspection.created_at.desc()).first()
    last_insp_str = last_insp.created_at.isoformat() if last_insp else None

    # Active signals for this center
    sig_count = db.query(SafetySignal).filter(
        SafetySignal.tenant_id == current_user.tenant_id,
        SafetySignal.center_id == center_ref,
        SafetySignal.dismissed == False,  # noqa: E712
    ).count()

    # Build safety notes
    notes: list[str] = []
    if sig_count > 0:
        notes.append(f"{sig_count} active safety signal(s) for this location")
    if open_ca > 0:
        notes.append(f"{open_ca} open corrective action(s) pending")
    if len(recent_incs) >= 3:
        notes.append(f"{len(recent_incs)} incidents in the past 30 days — review recommended")
    if not notes:
        notes.append("No active signals — location looks clear")

    return AssetContext(
        qr=_read(qr, _base_url()),
        recent_incidents=recent_list,
        open_corrective_actions=open_ca,
        last_inspection=last_insp_str,
        safety_notes=notes,
        signal_count=sig_count,
    )


@router.delete("/{qr_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_qr(
    qr_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    qr = db.query(QRCode).filter(
        QRCode.id == qr_id,
        QRCode.tenant_id == current_user.tenant_id,
    ).first()
    if not qr:
        raise HTTPException(status_code=404, detail="QR code not found")
    db.delete(qr)
    db.commit()
