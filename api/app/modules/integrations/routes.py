"""
Integration routes.

PackGuardian is an operational safety platform.
These routes enable cross-referencing with ecosystem partners (Aegis AI,
DP DVM Map) without duplicating their governance/licensing responsibilities.
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, HttpUrl
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User

from .models import INTEGRATION_APPS, RESOURCE_TYPES, IntegrationRef, IntegrationWebhook

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/integrations", tags=["Integrations"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class RefCreate(BaseModel):
    app_name: str
    resource_type: str
    resource_id: uuid.UUID
    external_id: str
    external_url: str | None = None


class RefRead(BaseModel):
    id: uuid.UUID
    app_name: str
    resource_type: str
    resource_id: uuid.UUID
    external_id: str
    external_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class WebhookCreate(BaseModel):
    app_name: str
    webhook_url: HttpUrl
    event_filter: str = "*"

    def url_str(self) -> str:
        return str(self.webhook_url)


class WebhookRead(BaseModel):
    id: uuid.UUID
    app_name: str
    webhook_url: str
    event_filter: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Cross-references ──────────────────────────────────────────────────────────

@router.post("/refs", response_model=RefRead, status_code=status.HTTP_201_CREATED)
def create_ref(
    payload: RefCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RefRead:
    """
    Register a cross-app reference: link a PackGuardian safety resource to an
    equivalent resource in an ecosystem partner app.
    PackGuardian stores the link only; it does not replicate the partner's data.
    """
    ref = IntegrationRef(
        tenant_id=current_user.tenant_id,
        app_name=payload.app_name,
        resource_type=payload.resource_type,
        resource_id=payload.resource_id,
        external_id=payload.external_id,
        external_url=payload.external_url,
    )
    db.add(ref)
    db.commit()
    db.refresh(ref)
    logger.info("[packguardian][integrations] Ref created: app=%s resource=%s/%s external=%s",
                payload.app_name, payload.resource_type, payload.resource_id, payload.external_id)
    return RefRead.model_validate(ref)


@router.get("/refs", response_model=list[RefRead])
def list_refs(
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    app_name: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[RefRead]:
    q = db.query(IntegrationRef).filter(
        IntegrationRef.tenant_id == current_user.tenant_id
    )
    if resource_type:
        q = q.filter(IntegrationRef.resource_type == resource_type)
    if resource_id:
        q = q.filter(IntegrationRef.resource_id == resource_id)
    if app_name:
        q = q.filter(IntegrationRef.app_name == app_name)
    return [RefRead.model_validate(r) for r in q.order_by(IntegrationRef.created_at.desc()).all()]


@router.delete("/refs/{ref_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ref(
    ref_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    ref = db.query(IntegrationRef).filter(
        IntegrationRef.id == ref_id,
        IntegrationRef.tenant_id == current_user.tenant_id,
    ).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Integration reference not found")
    db.delete(ref)
    db.commit()


# ── Outbound webhooks ─────────────────────────────────────────────────────────

@router.get("/webhooks", response_model=list[WebhookRead])
def list_webhooks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[WebhookRead]:
    rows = db.query(IntegrationWebhook).filter(
        IntegrationWebhook.tenant_id == current_user.tenant_id
    ).order_by(IntegrationWebhook.created_at.desc()).all()
    return [WebhookRead.model_validate(r) for r in rows]


@router.post("/webhooks", response_model=WebhookRead, status_code=status.HTTP_201_CREATED)
def register_webhook(
    payload: WebhookCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WebhookRead:
    hook = IntegrationWebhook(
        tenant_id=current_user.tenant_id,
        app_name=payload.app_name,
        webhook_url=payload.url_str(),
        event_filter=payload.event_filter,
    )
    db.add(hook)
    db.commit()
    db.refresh(hook)
    return WebhookRead.model_validate(hook)


@router.patch("/webhooks/{hook_id}/toggle", response_model=WebhookRead)
def toggle_webhook(
    hook_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WebhookRead:
    hook = db.query(IntegrationWebhook).filter(
        IntegrationWebhook.id == hook_id,
        IntegrationWebhook.tenant_id == current_user.tenant_id,
    ).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    hook.is_active = not hook.is_active
    db.commit()
    db.refresh(hook)
    return WebhookRead.model_validate(hook)


@router.delete("/webhooks/{hook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_webhook(
    hook_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    hook = db.query(IntegrationWebhook).filter(
        IntegrationWebhook.id == hook_id,
        IntegrationWebhook.tenant_id == current_user.tenant_id,
    ).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    db.delete(hook)
    db.commit()
