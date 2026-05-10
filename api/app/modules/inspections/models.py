import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

INSPECTION_TYPES = ("general", "kennel", "safety", "sanitation", "equipment")
INSPECTION_STATUSES = ("in_progress", "completed", "passed", "failed")
ITEM_RESULTS = ("pending", "pass", "fail", "na")
ITEM_SEVERITIES = ("critical", "major", "minor")

# Default checklist items per inspection type.
# Each entry: (label, severity)
INSPECTION_TEMPLATES: dict[str, list[tuple[str, str]]] = {
    "general": [
        ("Entry/exit areas clear and secure", "critical"),
        ("Emergency exits unobstructed", "critical"),
        ("First aid kit stocked and accessible", "major"),
        ("Fire extinguisher accessible and in-date", "critical"),
        ("Floors clean and dry", "minor"),
        ("Adequate lighting in all areas", "minor"),
        ("Chemicals properly stored and labeled", "major"),
        ("Staff PPE available", "major"),
    ],
    "kennel": [
        ("Kennels clean and sanitized", "major"),
        ("Water bowls filled and clean", "critical"),
        ("Proper ventilation in kennel areas", "major"),
        ("Kennel doors and latches functioning", "critical"),
        ("No signs of illness or injury in animals", "critical"),
        ("Isolation area clear and ready", "major"),
        ("Animal records up to date", "minor"),
        ("Feeding schedule followed", "minor"),
    ],
    "safety": [
        ("Safety data sheets accessible for all chemicals", "critical"),
        ("Incident log up to date", "major"),
        ("Slip/fall hazards identified and marked", "major"),
        ("Equipment inspection records current", "minor"),
        ("Staff safety training current", "major"),
        ("Emergency contact information posted", "critical"),
        ("Eyewash station accessible", "major"),
    ],
    "sanitation": [
        ("Disinfection log completed", "major"),
        ("Proper dilution ratios in use", "critical"),
        ("Waste disposal procedures followed", "major"),
        ("Hand washing stations accessible and stocked", "critical"),
        ("Food/water contamination risk areas addressed", "major"),
        ("Cleaning equipment in good condition", "minor"),
    ],
    "equipment": [
        ("Equipment in proper working order", "major"),
        ("No visible damage or excessive wear", "major"),
        ("Safety guards and features intact", "critical"),
        ("Maintenance records current", "minor"),
        ("Operator training records current", "minor"),
        ("Equipment tagged and identified", "minor"),
    ],
}

# Score deductions per severity per failed item
SEVERITY_DEDUCTION = {"critical": 25, "major": 15, "minor": 5}


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    center_code: Mapped[str] = mapped_column(String, nullable=False, index=True)
    qr_code_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    # Linked case created when inspection fails
    case_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    inspection_type: Mapped[str] = mapped_column(
        String, nullable=False, default="general"
    )
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="in_progress"
    )
    score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class InspectionItem(Base):
    __tablename__ = "inspection_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    inspection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    label: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    result: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    severity: Mapped[str] = mapped_column(String, nullable=False, default="minor")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    evidence_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
