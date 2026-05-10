import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User

from .models import Notification

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: uuid.UUID
    notification_type: str
    title: str
    message: str
    resource_type: str | None
    resource_id: uuid.UUID | None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


def emit(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    notification_type: str,
    title: str,
    message: str,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
) -> None:
    """Write a notification row and broadcast to the user's WS channel. Non-fatal."""
    n = Notification(
        tenant_id=tenant_id,
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        message=message,
        resource_type=resource_type,
        resource_id=resource_id,
    )
    db.add(n)
    # Broadcast to the specific user's WS channel (ID available via default)
    try:
        from app.modules.ws.events import notification_created
        notification_created(tenant_id, user_id=user_id,
                             notification_id=n.id,
                             notification_type=notification_type,
                             title=title)
    except Exception:
        pass


@router.get("", response_model=list[NotificationRead])
def list_notifications(
    unread_only: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[NotificationRead]:
    q = db.query(Notification).filter(
        Notification.tenant_id == current_user.tenant_id,
        Notification.user_id == current_user.id,
    )
    if unread_only:
        q = q.filter(Notification.is_read == False)  # noqa: E712
    rows = q.order_by(Notification.created_at.desc()).limit(limit).all()
    return [NotificationRead.model_validate(r) for r in rows]


@router.get("/unread-count", response_model=dict)
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    count = db.query(Notification).filter(
        Notification.tenant_id == current_user.tenant_id,
        Notification.user_id == current_user.id,
        Notification.is_read == False,  # noqa: E712
    ).count()
    return {"count": count}


@router.patch("/{notification_id}/read", response_model=NotificationRead)
def mark_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationRead:
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
        Notification.tenant_id == current_user.tenant_id,
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    db.refresh(n)
    return NotificationRead.model_validate(n)


@router.post("/read-all", response_model=dict)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    updated = db.query(Notification).filter(
        Notification.tenant_id == current_user.tenant_id,
        Notification.user_id == current_user.id,
        Notification.is_read == False,  # noqa: E712
    ).update({"is_read": True})
    db.commit()
    return {"marked_read": updated}
