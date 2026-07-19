import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

SIGNAL_TYPES = (
    "repeat_incident_type",      # same type in same location within window
    "repeat_location",           # multiple distinct incident types in same location
    "animal_recurrence",         # same dog in multiple incidents
    "repeat_entity",             # same employee in multiple incidents
    "temporal_cluster",          # burst of incidents in short time
    "unresolved_corrective",     # overdue corrective actions on incident type
    "escalation_pattern",        # repeated escalations
)

SIGNAL_SEVERITY = ("watch", "caution", "alert")


class SafetySignal(Base):
    __tablename__ = "safety_signals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    signal_type: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False, default="watch")
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    center_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    incident_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    entity_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    incident_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    window_days: Mapped[int] = mapped_column(Integer, nullable=False, default=14)
    incident_ids: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    dismissed: Mapped[bool] = mapped_column(
        __import__("sqlalchemy").Boolean, nullable=False, default=False, server_default="false"
    )
