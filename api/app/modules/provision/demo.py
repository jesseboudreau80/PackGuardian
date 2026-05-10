"""
Demo / trial data seeder.
Creates realistic sample operational data so new tenants can explore the platform.
Pure DB writes — no I/O.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session


_NOW = lambda: datetime.now(timezone.utc)


def seed_demo_data(db: Session, tenant_id: uuid.UUID, actor_id: uuid.UUID) -> dict:
    """
    Seed sample incidents, cases, and an inspection for a trial tenant.
    Returns counts of created objects.
    """
    from app.modules.osha.intelligence import analyze
    from app.modules.osha.models import Incident
    from app.modules.cases.service import auto_create_case
    from app.modules.osha.schemas import IncidentRead

    DEMO_INCIDENTS = [
        {
            "incident_type": "dog_fight",
            "center_id": "DEMO-01",
            "description": "Two dogs in kennel run 3B engaged in a fight. Staff intervened immediately. Minor lacerations on smaller dog.",
            "reported_severity": "high",
            "status": "open",
        },
        {
            "incident_type": "employee_injury",
            "center_id": "DEMO-01",
            "description": "Staff member slipped on wet floor near grooming station. Reported knee pain. Applied ice pack. No emergency services needed.",
            "reported_severity": "medium",
            "status": "open",
            "employee_name": "Alex Martinez",
            "job_title": "Kennel Technician",
            "treatment_type": "first_aid",
        },
        {
            "incident_type": "escape",
            "center_id": "DEMO-02",
            "description": "Medium-sized retriever mix found loose in parking lot. Kennel latch malfunction. Dog recovered safely within 5 minutes.",
            "reported_severity": "high",
            "status": "closed",
        },
        {
            "incident_type": "sanitation",
            "center_id": "DEMO-01",
            "description": "Bleach solution found improperly diluted in kennel cleaning bucket. Ratio approximately 1:5 instead of 1:32.",
            "reported_severity": "medium",
            "status": "in_progress",
        },
        {
            "incident_type": "pet_injury",
            "center_id": "DEMO-02",
            "description": "Labrador in group play developed limping. Owner notified. Veterinary evaluation recommended. No visible wound.",
            "reported_severity": "low",
            "status": "open",
        },
    ]

    created_incidents = 0
    created_cases = 0

    for i, data in enumerate(DEMO_INCIDENTS):
        description = data["description"]
        incident_type = data["incident_type"]
        severity = data["reported_severity"]
        intel = analyze(incident_type, description, severity)
        adjusted = intel.adjusted_severity if intel.adjusted_severity != severity else None

        inc = Incident(
            center_id=data["center_id"],
            incident_type=incident_type,
            description=description,
            reported_severity=severity,
            status=data["status"],
            category=intel.category,
            risk_score=intel.risk_score,
            recommendations=intel.recommendations,
            adjusted_severity=adjusted,
            explanation=intel.explanation,
            explanation_meta=intel.explanation_meta,
            employee_name=data.get("employee_name"),
            job_title=data.get("job_title"),
            treatment_type=data.get("treatment_type"),
            recordable=False,
            tenant_id=tenant_id,
            created_at=_NOW() - timedelta(days=30 - i * 5),
        )
        db.add(inc)
        db.flush()
        created_incidents += 1

        inc_read = IncidentRead.model_validate(inc)
        auto_create_case(db, inc_read, actor_id, tenant_id)
        db.flush()
        created_cases += 1

    # Seed one demo inspection
    from app.modules.inspections.models import INSPECTION_TEMPLATES, Inspection, InspectionItem
    inspection = Inspection(
        tenant_id=tenant_id,
        center_code="DEMO-01",
        created_by_user_id=actor_id,
        title="Demo General Inspection",
        inspection_type="general",
        status="passed",
        score=85,
        completed_at=_NOW() - timedelta(days=5),
    )
    db.add(inspection)
    db.flush()
    for idx, (label, severity) in enumerate(INSPECTION_TEMPLATES["general"]):
        db.add(InspectionItem(
            inspection_id=inspection.id,
            tenant_id=tenant_id,
            sort_order=idx,
            label=label,
            severity=severity,
            result="pass" if idx != 4 else "fail",  # one intentional fail
            notes="Minor issue noted" if idx == 4 else None,
        ))

    # Seed a demo center with coordinates
    from app.modules.map.models import Center
    db.add(Center(
        tenant_id=tenant_id,
        center_code="DEMO-01",
        name="Demo Center — Downtown",
        latitude=40.7128,
        longitude=-74.0060,
        city="New York",
        state="NY",
        address="123 Demo Street",
    ))
    db.add(Center(
        tenant_id=tenant_id,
        center_code="DEMO-02",
        name="Demo Center — Uptown",
        latitude=40.7831,
        longitude=-73.9712,
        city="New York",
        state="NY",
        address="456 Sample Ave",
    ))

    return {
        "incidents": created_incidents,
        "cases": created_cases,
        "inspections": 1,
        "centers": 2,
    }
