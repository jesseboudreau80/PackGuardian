"""
Tenant provisioning engine.
All functions take an open DB session and commit nothing — callers commit.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.tenant.models import Tenant

from .models import TenantSettings


def provision_tenant(
    db: Session,
    *,
    company_name: str,
    admin_email: str,
    admin_password: str,
    primary_color: str = "#4F46E5",
    secondary_color: str = "#6366F1",
    support_email: str = "",
    facility_type: str | None = None,
    is_trial: bool = False,
) -> tuple["Tenant", "User", str]:
    """
    Create a complete tenant stack:
      1. Tenant record
      2. Admin User
      3. TenantSettings (with safety defaults)
      4. Onboarding audit log entry

    Returns (tenant, admin_user, jwt_token).
    Caller must commit after this returns.
    """
    from app.modules.auth.models import User
    from app.modules.auth.security import create_access_token, hash_password
    from app.modules.organizations.models import OrgAuditLog
    from app.modules.tenant.models import Tenant

    # ── 1. Tenant ──────────────────────────────────────────────────────────
    tenant = Tenant(
        name=company_name,
        primary_color=primary_color,
        secondary_color=secondary_color,
        theme="light",
        support_email=support_email or admin_email,
    )
    db.add(tenant)
    db.flush()

    # ── 2. Admin user ──────────────────────────────────────────────────────
    admin = User(
        email=admin_email,
        password_hash=hash_password(admin_password),
        tenant_id=tenant.id,
        role="admin",
        is_active=True,
    )
    db.add(admin)
    db.flush()

    # ── 3. Tenant settings ─────────────────────────────────────────────────
    trial_expires = (
        datetime.now(timezone.utc) + timedelta(days=14) if is_trial else None
    )
    db.add(TenantSettings(
        tenant_id=tenant.id,
        is_trial=is_trial,
        trial_expires_at=trial_expires,
        facility_type=facility_type,
        onboarding_step=1,
    ))

    # ── 4. Audit ───────────────────────────────────────────────────────────
    db.add(OrgAuditLog(
        tenant_id=tenant.id,
        actor_id=admin.id,
        action="tenant_provisioned",
        resource_type="tenant",
        resource_id=tenant.id,
        details={
            "company_name": company_name,
            "admin_email": admin_email,
            "is_trial": is_trial,
            "facility_type": facility_type,
        },
    ))

    # ── 5. JWT ─────────────────────────────────────────────────────────────
    token = create_access_token({
        "sub": str(admin.id),
        "tenant_id": str(tenant.id),
        "role": "admin",
    })

    return tenant, admin, token


def seed_default_org(
    db: Session,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID,
    company_name: str,
) -> None:
    """
    Seed a minimal default org hierarchy:
      Enterprise (root) → one default Area → one default Center placeholder
    Caller must commit.
    """
    from app.modules.organizations.models import Organization

    enterprise = Organization(
        tenant_id=tenant_id,
        name=company_name,
        org_type="enterprise",
        parent_id=None,
    )
    db.add(enterprise)
    db.flush()

    area = Organization(
        tenant_id=tenant_id,
        name="Default Area",
        org_type="area",
        parent_id=enterprise.id,
    )
    db.add(area)
    db.flush()

    db.add(Organization(
        tenant_id=tenant_id,
        name="Main Center",
        org_type="center",
        parent_id=area.id,
    ))
