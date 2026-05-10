"""
Check logic for scanning tenant data and creating automation events.
All functions take a DB session and tenant_id; callers commit.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.modules.map.heat import compute_heat
from app.modules.map.models import Center
from app.modules.osha.models import Incident

from .events import (
    emit_emerging_risk,
    emit_high_risk_hotspot,
    emit_osha_overdue,
)
from .models import AutomationEvent

_HEAT_THRESHOLD = 75.0
_VELOCITY_THRESHOLD = 1.0
_OVERDUE_DAYS = 7


def run_checks(
    db: Session, tenant_id: uuid.UUID
) -> tuple[list[AutomationEvent], int]:
    """
    Scan all centers and incidents for trigger conditions.
    Returns (created_events, skipped_count).
    Caller must commit after this returns.
    """
    created: list[AutomationEvent] = []
    skipped = 0
    now = datetime.now(timezone.utc)

    # ── Heat-based checks (HIGH_RISK_HOTSPOT, EMERGING_RISK) ─────────────────
    centers = (
        db.query(Center)
        .filter(Center.tenant_id == tenant_id)
        .all()
    )

    if centers:
        since = now - timedelta(days=30)
        all_incidents: list[Incident] = (
            db.query(Incident)
            .filter(
                Incident.tenant_id == tenant_id,
                Incident.created_at >= since,
            )
            .all()
        )
        by_center: dict[str, list[Incident]] = {c.center_code: [] for c in centers}
        for inc in all_incidents:
            if inc.center_id in by_center:
                by_center[inc.center_id].append(inc)

        for center in centers:
            incidents = by_center[center.center_code]
            heat = compute_heat(incidents, now=now)

            heat_score: float = heat["heat_score"]
            emerging: str = heat["emerging_risk_level"]
            velocity: float = heat["trend_velocity"]

            if heat_score > _HEAT_THRESHOLD:
                event = emit_high_risk_hotspot(
                    db,
                    tenant_id,
                    center_id=center.center_code,
                    center_name=center.name,
                    heat_score=heat_score,
                    incident_count=len(incidents),
                    avg_risk_score=heat["avg_risk_score"],
                    emerging_risk_level=emerging,
                    trend_velocity=velocity,
                    top_drivers=heat["top_drivers"],
                    recommended_actions=heat["recommended_actions"],
                )
                if event:
                    created.append(event)
                else:
                    skipped += 1

            if emerging == "high" or velocity > _VELOCITY_THRESHOLD:
                event = emit_emerging_risk(
                    db,
                    tenant_id,
                    center_id=center.center_code,
                    center_name=center.name,
                    emerging_risk_level=emerging,
                    trend_velocity=velocity,
                    incident_count=len(incidents),
                    top_drivers=heat["top_drivers"],
                )
                if event:
                    created.append(event)
                else:
                    skipped += 1

    # ── OSHA_OVERDUE ──────────────────────────────────────────────────────────
    overdue_cutoff = now - timedelta(days=_OVERDUE_DAYS)
    overdue_incidents: list[Incident] = (
        db.query(Incident)
        .filter(
            Incident.tenant_id == tenant_id,
            Incident.status == "open",
            Incident.created_at <= overdue_cutoff,
        )
        .all()
    )

    for inc in overdue_incidents:
        ts = inc.created_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        days_overdue = int((now - ts).days)
        event = emit_osha_overdue(
            db,
            tenant_id,
            incident_id=inc.id,
            center_id=inc.center_id,
            incident_type=inc.incident_type,
            reported_severity=inc.reported_severity,
            days_overdue=days_overdue,
            created_at=ts.isoformat(),
        )
        if event:
            created.append(event)
        else:
            skipped += 1

    return created, skipped
