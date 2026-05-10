"""Audit log helpers — write only, never delete or update rows."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from .models import OrgAuditLog


def log(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Append an audit entry. Caller must commit."""
    db.add(
        OrgAuditLog(
            tenant_id=tenant_id,
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
        )
    )
