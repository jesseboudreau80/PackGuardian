import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User

from .models import SafetySignal
from .detector import refresh_signals

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/signals", tags=["Safety Signals"])


class SignalRead(BaseModel):
    id: uuid.UUID
    signal_type: str
    severity: str
    title: str
    description: str
    center_id: str | None
    incident_type: str | None
    entity_key: str | None
    incident_count: int
    window_days: int
    incident_ids: list[str] | None
    detected_at: datetime
    dismissed: bool

    model_config = {"from_attributes": True}


@router.get("", response_model=list[SignalRead])
def list_signals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SignalRead]:
    """Return current active (non-dismissed) safety signals for the tenant."""
    rows = db.query(SafetySignal).filter(
        SafetySignal.tenant_id == current_user.tenant_id,
        SafetySignal.dismissed == False,  # noqa: E712
    ).order_by(SafetySignal.detected_at.desc()).limit(50).all()
    return [SignalRead.model_validate(r) for r in rows]


@router.post("/refresh", response_model=list[SignalRead])
def refresh(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SignalRead]:
    """Re-run pattern detection and refresh signals. Returns the new signal set."""
    try:
        created = refresh_signals(db, current_user.tenant_id)
        db.commit()
        for sig in created:
            db.refresh(sig)
        return [SignalRead.model_validate(s) for s in created]
    except Exception as exc:
        logger.exception("[signals] refresh failed tenant=%s", current_user.tenant_id)
        raise HTTPException(status_code=500, detail="Signal refresh failed") from exc


@router.patch("/{signal_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_signal(
    signal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    sig = db.query(SafetySignal).filter(
        SafetySignal.id == signal_id,
        SafetySignal.tenant_id == current_user.tenant_id,
    ).first()
    if not sig:
        raise HTTPException(status_code=404, detail="Signal not found")
    sig.dismissed = True
    db.commit()
