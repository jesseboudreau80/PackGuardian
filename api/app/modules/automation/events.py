"""
Payload builders and DB writers for each automation event type.
All functions take an open SQLAlchemy session and commit nothing — callers commit.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from .models import AutomationEvent

if TYPE_CHECKING:
    from app.modules.osha.schemas import IncidentRead


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Deduplication ─────────────────────────────────────────────────────────────

def _already_pending(
    db: Session,
    tenant_id: uuid.UUID,
    event_type: str,
    key_field: str,
    key_value: str,
    window_hours: int = 24,
) -> bool:
    """
    Return True if an unprocessed event of the same type for the same key
    was created within the dedup window.  Uses JSONB ->> operator for the lookup.
    """
    from datetime import timedelta
    from sqlalchemy import text

    cutoff = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    row = db.execute(
        text(
            "SELECT 1 FROM automation_events"
            " WHERE tenant_id = :tid"
            "   AND event_type = :etype"
            "   AND processed_at IS NULL"
            "   AND payload ->> :key = :val"
            "   AND created_at >= :cutoff"
            " LIMIT 1"
        ),
        {
            "tid": str(tenant_id),
            "etype": event_type,
            "key": key_field,
            "val": key_value,
            "cutoff": cutoff,
        },
    ).fetchone()
    return row is not None


# ── HIGH_RISK_HOTSPOT ─────────────────────────────────────────────────────────

def emit_high_risk_hotspot(
    db: Session,
    tenant_id: uuid.UUID,
    *,
    center_id: str,
    center_name: str,
    heat_score: float,
    incident_count: int,
    avg_risk_score: float,
    emerging_risk_level: str,
    trend_velocity: float,
    top_drivers: list[str],
    recommended_actions: list[str],
) -> AutomationEvent | None:
    """Returns the created event, or None if deduped."""
    if _already_pending(db, tenant_id, "HIGH_RISK_HOTSPOT", "center_id", center_id):
        return None

    severity = "critical" if heat_score > 90 else "high"
    event = AutomationEvent(
        tenant_id=tenant_id,
        event_type="HIGH_RISK_HOTSPOT",
        severity=severity,
        payload={
            "tenant_id": str(tenant_id),
            "event_type": "HIGH_RISK_HOTSPOT",
            "center_id": center_id,
            "center_name": center_name,
            "heat_score": heat_score,
            "incident_count": incident_count,
            "avg_risk_score": avg_risk_score,
            "emerging_risk_level": emerging_risk_level,
            "trend_velocity": trend_velocity,
            "top_drivers": top_drivers,
            "recommended_actions": recommended_actions,
            "timestamp": _now_iso(),
        },
    )
    db.add(event)
    return event


# ── EMERGING_RISK ─────────────────────────────────────────────────────────────

def emit_emerging_risk(
    db: Session,
    tenant_id: uuid.UUID,
    *,
    center_id: str,
    center_name: str,
    emerging_risk_level: str,
    trend_velocity: float,
    incident_count: int,
    top_drivers: list[str],
) -> AutomationEvent | None:
    if _already_pending(db, tenant_id, "EMERGING_RISK", "center_id", center_id):
        return None

    severity = "critical" if trend_velocity > 2.0 else "high"
    event = AutomationEvent(
        tenant_id=tenant_id,
        event_type="EMERGING_RISK",
        severity=severity,
        payload={
            "tenant_id": str(tenant_id),
            "event_type": "EMERGING_RISK",
            "center_id": center_id,
            "center_name": center_name,
            "emerging_risk_level": emerging_risk_level,
            "trend_velocity": trend_velocity,
            "incident_count": incident_count,
            "top_drivers": top_drivers,
            "timestamp": _now_iso(),
        },
    )
    db.add(event)
    return event


# ── OSHA_OVERDUE ──────────────────────────────────────────────────────────────

def emit_osha_overdue(
    db: Session,
    tenant_id: uuid.UUID,
    *,
    incident_id: uuid.UUID,
    center_id: str,
    incident_type: str,
    reported_severity: str,
    days_overdue: int,
    created_at: str,
) -> AutomationEvent | None:
    if _already_pending(db, tenant_id, "OSHA_OVERDUE", "incident_id", str(incident_id)):
        return None

    severity = "high" if days_overdue > 14 else "medium"
    event = AutomationEvent(
        tenant_id=tenant_id,
        event_type="OSHA_OVERDUE",
        severity=severity,
        payload={
            "tenant_id": str(tenant_id),
            "event_type": "OSHA_OVERDUE",
            "incident_id": str(incident_id),
            "center_id": center_id,
            "incident_type": incident_type,
            "reported_severity": reported_severity,
            "days_overdue": days_overdue,
            "created_at": created_at,
            "timestamp": _now_iso(),
        },
    )
    db.add(event)
    return event


# ── INCIDENT_FINALIZED ────────────────────────────────────────────────────────

def emit_incident_finalized(
    db: Session,
    incident: "IncidentRead",
    tenant_id: uuid.UUID,
    finalized_by: str | None,
) -> AutomationEvent:
    """Always emits — finalization is a one-time event, no dedup needed."""
    event = AutomationEvent(
        tenant_id=tenant_id,
        event_type="INCIDENT_FINALIZED",
        severity="low",
        payload={
            "tenant_id": str(tenant_id),
            "event_type": "INCIDENT_FINALIZED",
            "incident_id": str(incident.id),
            "center_id": incident.center_id,
            "incident_type": incident.incident_type,
            "recordable": incident.recordable,
            "risk_score": incident.risk_score,
            "category": incident.category,
            "finalized_by": finalized_by,
            "timestamp": _now_iso(),
        },
    )
    db.add(event)
    return event
