import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    center_id: Mapped[str] = mapped_column(String, nullable=False)
    incident_type: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    # "severity" is the DB column name; Python accesses it as reported_severity.
    # Keeping the DB column name avoids a migration on existing tables.
    reported_severity: Mapped[str] = mapped_column("severity", String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    # Intelligence layer — nullable so existing rows are unaffected
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    risk_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    recommendations: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    adjusted_severity: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    explanation: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    explanation_meta: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # OSHA reporting fields — nullable; populated at incident creation or later update
    employee_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    job_title: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    date_of_injury: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    time_of_injury: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    body_part: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    treatment_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    days_away: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    restricted_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    recordable: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    # Finalization lock — once True, OSHA fields cannot be mutated.
    # server_default ensures existing rows get False when the column is added.
    is_finalized: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Multi-tenant FK — nullable for single-tenant compatibility.
    # Populate and add NOT NULL constraint when multi-tenant routing is activated.
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True
    )
    # Org-scoped assignment — nullable; incidents without an org are visible to
    # all tenant users (tenant-wide fallback).
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    # Operational risk pipeline — populated by compute_risk_score() on incident events.
    operational_risk_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    risk_contributors: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    risk_band: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_risk_evaluation_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    signal_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)


class IncidentAuditLog(Base):
    """Append-only audit trail for OSHA-critical fields. Never update or delete rows."""

    __tablename__ = "incident_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    incident_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("incidents.id"), nullable=False
    )
    field_name: Mapped[str] = mapped_column(String, nullable=False)
    old_value: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    changed_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class OshaLog(Base):
    """One row per recordable incident — the source of truth for Form 300."""

    __tablename__ = "osha_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    incident_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("incidents.id"), nullable=False
    )
    center_id: Mapped[str] = mapped_column(String, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    case_number: Mapped[int] = mapped_column(Integer, nullable=False)
    classification: Mapped[str] = mapped_column(String, nullable=False)
    days_away: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    restricted_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True
    )
