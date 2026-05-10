import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

FACILITY_TYPES = ("kennel", "daycare", "grooming", "boarding", "veterinary", "other")


def _invite_token() -> str:
    return secrets.token_urlsafe(32)


class TenantSettings(Base):
    """
    Extended per-tenant settings.  One row per tenant.
    Created during provisioning; updated via the tenant admin settings page.
    """

    __tablename__ = "tenant_settings"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    # Onboarding
    is_trial: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    trial_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    onboarding_step: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    facility_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Safety / OSHA defaults
    osha_reminder_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    osha_reminder_lead_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=30
    )
    default_inspection_cadence_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=30
    )
    default_escalation_hours: Mapped[int] = mapped_column(
        Integer, nullable=False, default=24
    )

    # Tenant-level terminology overrides — stored as {key: label} JSONB
    terminology: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class TenantInvitation(Base):
    """Pending user invitation.  Token is single-use and expires after 7 days."""

    __tablename__ = "tenant_invitations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="manager")
    # Optional pre-assignment to an org node
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    token: Mapped[str] = mapped_column(
        String, nullable=False, unique=True, default=_invite_token
    )
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    accepted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc) + timedelta(days=7),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
