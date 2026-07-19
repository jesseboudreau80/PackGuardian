"""
Internal API — service-to-service endpoints for Aegis agents.

All routes require X-Internal-Key header matching PACKGUARDIAN_INTERNAL_KEY in .env.
These are never exposed to end users and are scoped to localhost-level trust.

Agents that consume these endpoints:
  Ares     — safety pattern scan (incident spike detection)
  Dike     — OSHA compliance audit (deadline enforcement)
  Asclepius — corrective action suggestions
  Helios   — monthly compliance reports
  Hestia   — tenant welcome flow
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.modules.cases.models import IncidentCase, IncidentTask
from app.modules.corrective_actions.models import CorrectiveAction
from app.modules.osha.models import Incident

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/internal", tags=["Internal (Aegis)"])


def _require_internal_key(x_internal_key: Annotated[str | None, Header()] = None):
    key = settings.packguardian_internal_key
    if not key:
        raise HTTPException(status_code=503, detail="Internal API not configured")
    if x_internal_key != key:
        raise HTTPException(status_code=401, detail="Invalid internal key")


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    _key=Depends(_require_internal_key),
) -> dict:
    """
    Fleet-level health summary for Aegis agents.
    Returns incident counts, case counts, OSHA recordables, open CAs.
    No tenant scoping — returns aggregate stats for the demo/primary tenant.
    """
    from app.modules.tenant.models import DEFAULT_TENANT_ID
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    total_incidents = db.query(Incident).filter(
        Incident.tenant_id == DEFAULT_TENANT_ID
    ).count()

    recent_incidents = db.query(Incident).filter(
        Incident.tenant_id == DEFAULT_TENANT_ID,
        Incident.created_at >= week_ago,
    ).count()

    recordable_ytd = db.query(Incident).filter(
        Incident.tenant_id == DEFAULT_TENANT_ID,
        Incident.recordable == True,  # noqa: E712
    ).count()

    open_cases = db.query(IncidentCase).filter(
        IncidentCase.tenant_id == DEFAULT_TENANT_ID,
        IncidentCase.status.notin_(["closed", "resolved"]),
    ).count()

    open_cas = db.query(CorrectiveAction).filter(
        CorrectiveAction.tenant_id == DEFAULT_TENANT_ID,
        CorrectiveAction.status.notin_(["completed", "closed", "verified"]),
    ).count()

    overdue_cas = db.query(CorrectiveAction).filter(
        CorrectiveAction.tenant_id == DEFAULT_TENANT_ID,
        CorrectiveAction.status.notin_(["completed", "closed", "verified"]),
        CorrectiveAction.due_date < now.date(),
    ).count()

    return {
        "generated_at": now.isoformat(),
        "tenant": "demo",
        "incidents": {
            "total": total_incidents,
            "last_7_days": recent_incidents,
            "recordable_ytd": recordable_ytd,
        },
        "cases": {
            "open": open_cases,
        },
        "corrective_actions": {
            "open": open_cas,
            "overdue": overdue_cas,
        },
    }


# ── Ares: incident pattern data ───────────────────────────────────────────────

@router.get("/incidents/recent")
def get_recent_incidents(
    days: int = 7,
    db: Session = Depends(get_db),
    _key=Depends(_require_internal_key),
) -> dict:
    """Recent incidents for Ares to scan for category spikes."""
    from app.modules.tenant.models import DEFAULT_TENANT_ID
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.query(Incident).filter(
        Incident.tenant_id == DEFAULT_TENANT_ID,
        Incident.created_at >= since,
    ).order_by(Incident.created_at.desc()).limit(100).all()

    by_category: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    for r in rows:
        cat = r.category or "unknown"
        sev = str(r.reported_severity) if r.reported_severity else "unknown"
        by_category[cat] = by_category.get(cat, 0) + 1
        by_severity[sev] = by_severity.get(sev, 0) + 1

    spikes = [
        {"category": cat, "count": count}
        for cat, count in by_category.items()
        if count >= 3
    ]

    return {
        "period_days": days,
        "total": len(rows),
        "by_category": by_category,
        "by_severity": by_severity,
        "pattern_spikes": spikes,
    }


# ── Dike: OSHA compliance audit data ─────────────────────────────────────────

@router.get("/osha/audit")
def get_osha_audit(
    db: Session = Depends(get_db),
    _key=Depends(_require_internal_key),
) -> dict:
    """
    OSHA compliance audit snapshot for Dike.
    Finds recordables missing required Form 301 data and deadline violations.
    """
    from app.modules.tenant.models import DEFAULT_TENANT_ID
    now = datetime.now(timezone.utc)
    deadline_days = 7

    recordables = db.query(Incident).filter(
        Incident.tenant_id == DEFAULT_TENANT_ID,
        Incident.recordable == True,  # noqa: E712
    ).all()

    violations = []
    pending_documentation = []
    for r in recordables:
        age_days = (now.date() - r.created_at.date()).days if r.created_at else 0
        has_osha_data = bool(r.days_away or r.restricted_days or r.body_part)
        if not has_osha_data:
            entry = {
                "incident_id": str(r.id),
                "category": r.category,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "age_days": age_days,
            }
            if age_days > deadline_days:
                violations.append(entry)
            else:
                pending_documentation.append(entry)

    return {
        "generated_at": now.isoformat(),
        "total_recordables": len(recordables),
        "deadline_violations": violations,
        "pending_within_deadline": pending_documentation,
        "compliance_rate": round(
            (len(recordables) - len(violations)) / max(len(recordables), 1) * 100, 1
        ),
    }


# ── Asclepius: open incidents needing corrective actions ──────────────────────

@router.get("/corrective-actions/gaps")
def get_ca_gaps(
    db: Session = Depends(get_db),
    _key=Depends(_require_internal_key),
) -> dict:
    """Incidents with no corrective actions for Asclepius to address."""
    from app.modules.tenant.models import DEFAULT_TENANT_ID
    from app.modules.cases.models import IncidentCase

    cases_with_no_ca = (
        db.query(IncidentCase)
        .filter(
            IncidentCase.tenant_id == DEFAULT_TENANT_ID,
            IncidentCase.status.notin_(["closed", "resolved"]),
        )
        .all()
    )

    gaps = []
    for case in cases_with_no_ca:
        ca_count = db.query(CorrectiveAction).filter(
            CorrectiveAction.case_id == case.id
        ).count()
        if ca_count == 0 and case.incident_id:
            incident = db.query(Incident).filter(Incident.id == case.incident_id).first()
            if incident:
                gaps.append({
                    "case_id": str(case.id),
                    "incident_id": str(incident.id),
                    "category": incident.category,
                    "severity": str(incident.reported_severity),
                    "is_recordable": incident.recordable,
                    "created_at": incident.created_at.isoformat() if incident.created_at else None,
                })

    return {"open_cases_with_no_ca": gaps, "total": len(gaps)}


# ── Helios: compliance report data ────────────────────────────────────────────

@router.get("/compliance/report")
def get_compliance_report(
    year: int | None = None,
    db: Session = Depends(get_db),
    _key=Depends(_require_internal_key),
) -> dict:
    """Full compliance snapshot for Helios monthly report generation."""
    from app.modules.tenant.models import DEFAULT_TENANT_ID
    report_year = year or datetime.now(timezone.utc).year

    incidents = db.query(Incident).filter(
        Incident.tenant_id == DEFAULT_TENANT_ID,
    ).all()

    year_incidents = [i for i in incidents if i.created_at and i.created_at.year == report_year]
    recordables = [i for i in year_incidents if i.recordable]
    lost_time = [i for i in recordables if i.days_away and i.days_away > 0]

    open_cases = db.query(IncidentCase).filter(
        IncidentCase.tenant_id == DEFAULT_TENANT_ID,
        IncidentCase.status.notin_(["closed", "resolved"]),
    ).count()

    open_cas = db.query(CorrectiveAction).filter(
        CorrectiveAction.tenant_id == DEFAULT_TENANT_ID,
        CorrectiveAction.status.notin_(["completed", "closed", "verified"]),
    ).count()

    return {
        "year": report_year,
        "total_incidents": len(year_incidents),
        "recordable_count": len(recordables),
        "lost_time_cases": len(lost_time),
        "open_cases": open_cases,
        "open_corrective_actions": open_cas,
        "recordable_rate_pct": round(len(recordables) / max(len(year_incidents), 1) * 100, 1),
    }
