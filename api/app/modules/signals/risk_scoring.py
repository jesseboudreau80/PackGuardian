"""
Layered operational risk scoring.

Produces a 0–100 score with named contributors for any incident.
This is for operational prioritization, not discipline.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


_SEVERITY_BASE = {"low": 10, "medium": 25, "high": 45, "critical": 70}
_TYPE_WEIGHT = {
    "dog_bite": 10, "dog_fight": 8, "employee_injury": 12, "chemical": 10,
    "escape": 8, "grooming": 5, "near_miss": 3, "aggressive_behavior": 5,
    "slip_fall": 7, "facility_damage": 4,
}


def compute_risk_score(db: "Session", incident) -> tuple[int, dict]:
    """
    Compute operational risk score (0–100) and contributor breakdown.
    Returns (score, contributors_dict).
    """
    from datetime import datetime, timedelta, timezone
    from app.modules.corrective_actions.models import CorrectiveAction
    from app.modules.cases.models import IncidentCase
    from app.modules.osha.models import Incident

    contributors: dict[str, int] = {}
    score = 0

    # 1. Severity base
    eff_sev = incident.adjusted_severity or incident.reported_severity
    sev_pts = _SEVERITY_BASE.get(eff_sev, 20)
    contributors["severity"] = sev_pts
    score += sev_pts

    # 2. Incident type weight
    type_pts = _TYPE_WEIGHT.get(incident.incident_type, 5)
    contributors["incident_type"] = type_pts
    score += type_pts

    # 3. OSHA recordable
    if incident.recordable:
        contributors["osha_recordable"] = 10
        score += 10
    if incident.days_away and incident.days_away > 0:
        contributors["days_away"] = min(incident.days_away * 2, 10)
        score += contributors["days_away"]

    # 4. Case escalation
    case = db.query(IncidentCase).filter(IncidentCase.incident_id == incident.id).first()
    if case and case.escalation_level >= 1:
        esc_pts = min(case.escalation_level * 5, 15)
        contributors["escalation"] = esc_pts
        score += esc_pts

    # 5. Unresolved corrective actions
    if case:
        now = datetime.now(timezone.utc)
        overdue_ca = db.query(CorrectiveAction).filter(
            CorrectiveAction.case_id == case.id,
            CorrectiveAction.status.notin_(["completed"]),
            CorrectiveAction.due_date < now,
        ).count()
        if overdue_ca > 0:
            ca_pts = min(overdue_ca * 5, 15)
            contributors["overdue_corrective_actions"] = ca_pts
            score += ca_pts

    # 6. Repeat incidents at same center (last 30 days)
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    repeat_count = db.query(Incident).filter(
        Incident.tenant_id == incident.tenant_id,
        Incident.center_id == incident.center_id,
        Incident.incident_type == incident.incident_type,
        Incident.created_at >= cutoff,
        Incident.id != incident.id,
    ).count()
    if repeat_count >= 2:
        repeat_pts = min(repeat_count * 3, 12)
        contributors["repeat_incidents"] = repeat_pts
        score += repeat_pts

    # 7. Missing documentation penalty
    missing = 0
    if not incident.employee_name and incident.incident_type in ("dog_bite", "employee_injury", "slip_fall"):
        missing += 1
    if not incident.treatment_type:
        missing += 1
    if not incident.body_part and incident.incident_type in ("dog_bite", "employee_injury"):
        missing += 1
    if missing > 0:
        doc_pts = missing * 2
        contributors["missing_documentation"] = doc_pts
        score += doc_pts

    return min(score, 100), contributors


RISK_BANDS = [
    (80, "critical"),
    (60, "high"),
    (40, "elevated"),
    (20, "moderate"),
    (0,  "low"),
]


def risk_band(score: int) -> str:
    for threshold, label in RISK_BANDS:
        if score >= threshold:
            return label
    return "low"


def apply_risk_score(db: "Session", incident_id, tenant_id) -> None:
    """
    Recompute and persist operational_risk_score, risk_band, risk_contributors,
    and last_risk_evaluation_at on the incident row. Safe to call multiple times.
    """
    from datetime import datetime, timezone
    from app.modules.osha.models import Incident

    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.tenant_id == tenant_id,
    ).first()
    if not incident:
        return

    try:
        score, contributors = compute_risk_score(db, incident)
        band = risk_band(score)
        incident.operational_risk_score = score
        incident.risk_contributors = contributors
        incident.risk_band = band
        incident.last_risk_evaluation_at = datetime.now(timezone.utc)
        db.flush()
    except Exception:
        import logging
        logging.getLogger(__name__).warning(
            "[risk] Failed to apply risk score for incident %s", incident_id, exc_info=True
        )
