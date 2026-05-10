"""
OSHA compliance record-keeping models for PackGuardian.

Retention rule per 29 CFR 1904.33:
  OSHA 300, 301, and 300A logs must be kept for five (5) years
  following the end of the calendar year that these records cover.
  Retention expires = December 31 of (calendar_year + 5).
"""
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _retention_expires(calendar_year: int) -> datetime:
    """29 CFR 1904.33: five years after December 31 of the record year."""
    import calendar
    last_day = calendar.monthrange(calendar_year + 5, 12)[1]
    return datetime(calendar_year + 5, 12, last_day, 23, 59, 59, tzinfo=timezone.utc)


OSHA_FORM_TYPES = ("300", "301", "300A")


class OSHARetentionRecord(Base):
    """
    Tracks OSHA record retention obligations per 29 CFR 1904.33.
    One row per incident-form type combination.
    """

    __tablename__ = "osha_retention_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    incident_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    osha_log_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    osha_form_type: Mapped[str] = mapped_column(String, nullable=False)
    calendar_year: Mapped[int] = mapped_column(Integer, nullable=False)
    finalized_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    retention_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    archive_location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class OSHAPosting(Base):
    """
    Tracks annual Form 300A posting compliance (Feb 1 – Apr 30).
    Stores a snapshot of the 300A data at time of posting for audit defence.
    """

    __tablename__ = "osha_postings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    center_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    posted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    posted_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    acknowledgement_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Immutable snapshot of 300A data captured at generation time
    form_300a_snapshot: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
