import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user, require_admin
from app.modules.auth.models import User

from .models import Tenant
from .schemas import TenantRead, TenantUpdate, ThemeUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tenant", tags=["Tenant"])


def _get_or_raise(db: Session) -> Tenant:
    tenant = db.query(Tenant).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not configured")
    return tenant


@router.get("", response_model=TenantRead)
def get_tenant(db: Session = Depends(get_db)) -> TenantRead:
    """Public branding fetch — used by login page before auth."""
    try:
        return TenantRead.model_validate(_get_or_raise(db))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to fetch tenant config")
        raise HTTPException(status_code=500, detail="Failed to fetch tenant config") from exc


@router.get("/me", response_model=TenantRead)
def get_my_tenant(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantRead:
    """Auth-protected: returns the authenticated user's own tenant."""
    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return TenantRead.model_validate(tenant)


@router.put("", response_model=TenantRead)
def update_tenant(
    payload: TenantUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> TenantRead:
    """Update branding config. All fields optional — only provided fields are changed."""
    try:
        tenant = _get_or_raise(db)
        for field, value in payload.model_dump(exclude_none=True).items():
            setattr(tenant, field, value)
        db.commit()
        db.refresh(tenant)
        return TenantRead.model_validate(tenant)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to update tenant config")
        raise HTTPException(status_code=500, detail="Failed to update tenant config") from exc


@router.post("/theme", response_model=TenantRead)
def update_theme(
    payload: ThemeUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> TenantRead:
    """Toggle between light and dark theme without a full config update."""
    try:
        tenant = _get_or_raise(db)
        tenant.theme = payload.theme
        db.commit()
        db.refresh(tenant)
        return TenantRead.model_validate(tenant)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to update theme")
        raise HTTPException(status_code=500, detail="Failed to update theme") from exc
