import uuid
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from .audit import AUDITED_FIELDS, _to_audit_str, diff_audited_fields, initial_audit_entries, write_audit_entries
from .intelligence import analyze
from .models import Incident, OshaLog
from .schemas import FinalizeRequest, IncidentCreate, IncidentOshaUpdate, IncidentRead


class IncidentFinalizedError(Exception):
    """Raised when an attempt is made to mutate a finalized incident's OSHA fields."""


# ── Recordability ─────────────────────────────────────────────────────────────

def determine_recordability(
    treatment_type: str | None,
    days_away: int | None,
    restricted_days: int | None,
) -> bool:
    """
    OSHA 29 CFR 1904: an incident is recordable when it results in:
    - medical treatment beyond first aid, emergency room visit, or hospitalization
    - one or more days away from work
    - restricted work activity
    """
    if treatment_type in ("medical", "emergency_room", "hospitalization"):
        return True
    if days_away and days_away > 0:
        return True
    if restricted_days and restricted_days > 0:
        return True
    return False


def _classify_osha(days_away: int | None, restricted_days: int | None) -> str:
    if days_away and days_away > 0:
        return "days_away"
    if restricted_days and restricted_days > 0:
        return "restricted"
    return "other"


def _create_osha_log(
    db: Session, incident: Incident, tenant_id: uuid.UUID
) -> None:
    if not incident.recordable or not incident.date_of_injury:
        return
    year = incident.date_of_injury.year
    max_case = (
        db.query(func.max(OshaLog.case_number))
        .filter(
            OshaLog.tenant_id == tenant_id,
            OshaLog.center_id == incident.center_id,
            OshaLog.year == year,
        )
        .scalar()
    ) or 0
    entry = OshaLog(
        incident_id=incident.id,
        center_id=incident.center_id,
        year=year,
        case_number=max_case + 1,
        classification=_classify_osha(incident.days_away, incident.restricted_days),
        days_away=incident.days_away or 0,
        restricted_days=incident.restricted_days or 0,
        tenant_id=tenant_id,
    )
    db.add(entry)


# ── CRUD ──────────────────────────────────────────────────────────────────────

def create_incident(
    db: Session, data: IncidentCreate, tenant_id: uuid.UUID
) -> IncidentRead:
    intel = analyze(data.incident_type, data.description, data.reported_severity.value)

    adjusted = (
        intel.adjusted_severity
        if intel.adjusted_severity != data.reported_severity.value
        else None
    )
    recordable = determine_recordability(
        data.treatment_type.value if data.treatment_type else None,
        data.days_away,
        data.restricted_days,
    )

    incident = Incident(
        **data.model_dump(),
        category=intel.category,
        risk_score=intel.risk_score,
        recommendations=intel.recommendations,
        adjusted_severity=adjusted,
        explanation=intel.explanation,
        explanation_meta=intel.explanation_meta,
        recordable=recordable,
        tenant_id=tenant_id,
    )
    db.add(incident)
    db.flush()  # assign id before audit + log entries reference it
    write_audit_entries(db, incident.id, initial_audit_entries(incident))
    _create_osha_log(db, incident, tenant_id)
    db.commit()
    db.refresh(incident)
    return IncidentRead.model_validate(incident)


def update_incident_osha(
    db: Session, incident_id: UUID, data: IncidentOshaUpdate, tenant_id: uuid.UUID
) -> IncidentRead:
    incident = (
        db.query(Incident)
        .filter(Incident.id == incident_id, Incident.tenant_id == tenant_id)
        .first()
    )
    if incident is None:
        raise ValueError(f"Incident {incident_id} not found")
    if incident.is_finalized:
        raise IncidentFinalizedError(
            f"Incident {incident_id} is finalized and cannot be modified. "
            "Contact an administrator to override."
        )

    # 1. Snapshot old values of every audited field before touching the row.
    old_snapshot: dict[str, str | None] = {
        f: _to_audit_str(getattr(incident, f, None)) for f in AUDITED_FIELDS
    }

    # 2. Apply all non-None updates from the request.
    updates = {
        k: v
        for k, v in data.model_dump(exclude={"changed_by"}).items()
        if v is not None
    }
    for field, value in updates.items():
        setattr(incident, field, value)

    # 3. Recompute recordable if the caller did not explicitly set it.
    if data.recordable is None:
        incident.recordable = determine_recordability(
            incident.treatment_type,
            incident.days_away,
            incident.restricted_days,
        )

    # 4. Diff old snapshot vs new state for all audited fields; write one pass.
    changes: dict[str, tuple[str | None, str | None]] = {}
    for field in AUDITED_FIELDS:
        new_str = _to_audit_str(getattr(incident, field, None))
        if old_snapshot[field] != new_str:
            changes[field] = (old_snapshot[field], new_str)

    write_audit_entries(db, incident.id, changes, changed_by=data.changed_by)

    db.commit()
    db.refresh(incident)
    return IncidentRead.model_validate(incident)


def finalize_incident(
    db: Session, incident_id: UUID, data: FinalizeRequest, tenant_id: uuid.UUID
) -> IncidentRead:
    incident = (
        db.query(Incident)
        .filter(Incident.id == incident_id, Incident.tenant_id == tenant_id)
        .first()
    )
    if incident is None:
        raise ValueError(f"Incident {incident_id} not found")
    if incident.is_finalized:
        raise IncidentFinalizedError(f"Incident {incident_id} is already finalized")

    # TODO: check admin role here when auth is added — data.finalized_by

    incident.is_finalized = True
    write_audit_entries(
        db,
        incident.id,
        {"is_finalized": ("False", "True")},
        changed_by=data.finalized_by,
    )
    db.commit()
    db.refresh(incident)
    return IncidentRead.model_validate(incident)


def list_incidents(db: Session, tenant_id: uuid.UUID) -> list[IncidentRead]:
    rows = (
        db.query(Incident)
        .filter(Incident.tenant_id == tenant_id)
        .order_by(Incident.created_at.desc())
        .all()
    )
    return [IncidentRead.model_validate(r) for r in rows]
