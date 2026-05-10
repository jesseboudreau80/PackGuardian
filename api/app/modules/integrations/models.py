"""
Inter-app integration layer.

PackGuardian is an operational safety and OSHA automation platform.
Broad compliance/licensing/governance belongs to Aegis AI and DP DVM Map.

This module provides:
  - Cross-reference registry: link a PackGuardian resource to a resource
    in an external ecosystem app (Aegis AI, DP DVM Map, etc.)
  - Outbound webhook configuration: PackGuardian notifies other apps of
    safety events without duplicating their functionality.

PackGuardian does NOT receive governance or licensing data from other apps.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

INTEGRATION_APPS = ("aegis_ai", "dp_dvm_map", "custom")

RESOURCE_TYPES = (
    "incident",
    "case",
    "inspection",
    "osha_posting",
)


class IntegrationRef(Base):
    """
    Cross-app reference: a PackGuardian resource linked to a resource in an
    external ecosystem application.

    Example: an OSHA-recordable incident in PackGuardian that is also
    referenced in Aegis AI for compliance tracking.
    PackGuardian stores the reference only — governance logic stays in Aegis AI.
    """

    __tablename__ = "integration_refs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    app_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String, nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    external_id: Mapped[str] = mapped_column(String, nullable=False)
    external_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class IntegrationWebhook(Base):
    """
    Outbound webhook endpoint registered by an ecosystem app to receive
    PackGuardian safety events.

    These are PUSH notifications from PackGuardian to the other app —
    safety events that other platforms may need to know about.
    """

    __tablename__ = "integration_webhooks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    app_name: Mapped[str] = mapped_column(String, nullable=False)
    webhook_url: Mapped[str] = mapped_column(String, nullable=False)
    # Which PackGuardian events to forward (comma-separated event types, or "*")
    event_filter: Mapped[str] = mapped_column(String, nullable=False, default="*")
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
