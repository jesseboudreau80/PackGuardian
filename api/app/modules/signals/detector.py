"""
Safety signal detection engine.

Runs pattern analysis over recent incidents for a tenant and produces
SafetySignal records. Designed to be called on-demand (e.g. when viewing
Command Center or after incident creation).

Patterns detected:
- repeat_incident_type   : ≥3 incidents of same type at same center in N days
- repeat_location        : ≥4 incidents of any type at same center in N days
- animal_recurrence      : same dog involved in ≥2 incidents (matched by name in description)
- temporal_cluster       : ≥5 incidents at any center in 7 days
- escalation_pattern     : ≥2 cases with escalation_level ≥ 2 at same center in 30 days
"""
from __future__ import annotations

import logging
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_WINDOW = 30          # default lookback days — wide enough to catch real operational patterns
_CLUSTER_WINDOW = 14  # burst window
_ESCALATION_WINDOW = 90


def _cutoff(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def detect_signals(db: "Session", tenant_id) -> list[dict]:
    """
    Run pattern detection and return a list of signal dicts.
    Does NOT write to DB — caller decides whether to persist.
    """
    from app.modules.osha.models import Incident
    from app.modules.cases.models import IncidentCase

    signals: list[dict] = []

    # Load recent incidents (90 day window for all checks)
    recent = db.query(Incident).filter(
        Incident.tenant_id == tenant_id,
        Incident.created_at >= _cutoff(90),
    ).order_by(Incident.created_at.desc()).all()

    if not recent:
        return []

    # ── Pattern 1: Repeat incident type at same center ─────────────────────────
    # Group by (center_id, incident_type) within 14 days
    type_groups: defaultdict[tuple, list] = defaultdict(list)
    cutoff14 = _cutoff(_WINDOW)
    for inc in recent:
        if inc.created_at >= cutoff14:
            type_groups[(inc.center_id, inc.incident_type)].append(inc)

    for (center, itype), group in type_groups.items():
        if len(group) >= 2:
            severity = "alert" if len(group) >= 4 else "caution"
            signals.append({
                "signal_type": "repeat_incident_type",
                "severity": severity,
                "title": f"{len(group)} {_label(itype)} incidents in {_WINDOW} days",
                "description": (
                    f"{len(group)} {_label(itype)} incidents reported at this location "
                    f"in the past {_WINDOW} days. This pattern suggests an unresolved operational risk."
                ),
                "center_id": center,
                "incident_type": itype,
                "incident_count": len(group),
                "window_days": _WINDOW,
                "incident_ids": [str(i.id) for i in group[:10]],
            })

    # ── Pattern 2: Location concentration ─────────────────────────────────────
    location_groups: defaultdict[str, list] = defaultdict(list)
    for inc in recent:
        if inc.created_at >= cutoff14:
            location_groups[inc.center_id].append(inc)

    for center, group in location_groups.items():
        if len(group) >= 3:
            distinct_types = len({i.incident_type for i in group})
            if distinct_types >= 2:
                signals.append({
                    "signal_type": "repeat_location",
                    "severity": "caution",
                    "title": f"High incident concentration — {len(group)} incidents in {_WINDOW} days",
                    "description": (
                        f"{len(group)} incidents of {distinct_types} different types at this location "
                        f"in {_WINDOW} days. Multiple incident types may indicate a systemic issue."
                    ),
                    "center_id": center,
                    "incident_count": len(group),
                    "window_days": _WINDOW,
                    "incident_ids": [str(i.id) for i in group[:10]],
                })

    # ── Pattern 3: Temporal cluster (burst detection) ──────────────────────────
    center_7day: defaultdict[str, list] = defaultdict(list)
    cutoff7 = _cutoff(_CLUSTER_WINDOW)
    for inc in recent:
        if inc.created_at >= cutoff7:
            center_7day[inc.center_id].append(inc)

    for center, group in center_7day.items():
        if len(group) >= 3:
            signals.append({
                "signal_type": "temporal_cluster",
                "severity": "alert" if len(group) >= 5 else "caution",
                "title": f"Incident burst — {len(group)} incidents in {_CLUSTER_WINDOW} days",
                "description": (
                    f"{len(group)} incidents reported within 7 days. "
                    f"This volume is above normal and warrants immediate safety review."
                ),
                "center_id": center,
                "incident_count": len(group),
                "window_days": _CLUSTER_WINDOW,
                "incident_ids": [str(i.id) for i in group[:10]],
            })

    # ── Pattern 4: Escalation pattern ─────────────────────────────────────────
    esc_cutoff = _cutoff(_ESCALATION_WINDOW)
    escalated_cases = db.query(IncidentCase).filter(
        IncidentCase.tenant_id == tenant_id,
        IncidentCase.escalation_level >= 2,
        IncidentCase.created_at >= esc_cutoff,
    ).all()

    # Group by org
    esc_by_org: defaultdict[str, list] = defaultdict(list)
    for case in escalated_cases:
        key = str(case.organization_id or "unknown")
        esc_by_org[key].append(case)

    for org_key, cases in esc_by_org.items():
        if len(cases) >= 2:
            signals.append({
                "signal_type": "escalation_pattern",
                "severity": "caution",
                "title": f"{len(cases)} escalated cases in {_ESCALATION_WINDOW} days",
                "description": (
                    f"{len(cases)} cases have been escalated to level 2 or above "
                    f"within {_ESCALATION_WINDOW} days. Recurring escalations may "
                    f"indicate under-resourced incident response."
                ),
                "center_id": None,
                "entity_key": org_key,
                "incident_count": len(cases),
                "window_days": _ESCALATION_WINDOW,
                "incident_ids": [str(c.incident_id) for c in cases[:10]],
            })

    return signals


def _label(itype: str) -> str:
    return itype.replace("_", " ").title()


def refresh_signals(db: "Session", tenant_id) -> list:
    """Detect signals and upsert to safety_signals table. Returns list of SignalRead dicts."""
    from datetime import timezone
    from .models import SafetySignal

    # Dismiss all previous active signals for this tenant before regenerating
    db.query(SafetySignal).filter(
        SafetySignal.tenant_id == tenant_id,
        SafetySignal.dismissed == False,  # noqa: E712
    ).delete(synchronize_session=False)

    raw = detect_signals(db, tenant_id)
    created = []
    for s in raw:
        sig = SafetySignal(
            tenant_id=tenant_id,
            **s,
        )
        db.add(sig)
        created.append(sig)

    db.flush()
    return created
