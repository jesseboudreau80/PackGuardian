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
