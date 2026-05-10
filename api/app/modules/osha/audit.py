"""
Audit helpers for OSHA-critical incident fields.

Rules:
- Entries are written inside the caller's transaction, committed with it.
- Old/new values are stored as nullable strings for uniform querying.
- Rows are never updated or deleted — this log is append-only by design.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .models import IncidentAuditLog

AUDITED_FIELDS: frozenset[str] = frozenset(
    {"treatment_type", "days_away", "restricted_days", "recordable"}
)


def _to_audit_str(value: object) -> str | None:
    """Normalise a field value to a nullable string for audit storage."""
    return str(value) if value is not None else None


def write_audit_entries(
    db: Session,
    incident_id: uuid.UUID,
    changes: dict[str, tuple[str | None, str | None]],
    changed_by: str | None = None,
) -> None:
    """
    Insert one audit row per changed field. Call before db.commit().
    `changes` maps field_name → (old_value_str, new_value_str).
    """
    now = datetime.now(timezone.utc)
    for field_name, (old_val, new_val) in changes.items():
        db.add(
            IncidentAuditLog(
                incident_id=incident_id,
                field_name=field_name,
                old_value=old_val,
                new_value=new_val,
                changed_at=now,
                changed_by=changed_by,
            )
        )


def diff_audited_fields(
    incident: object,
    updates: dict[str, object],
) -> dict[str, tuple[str | None, str | None]]:
    """
    Compare each audited field in `updates` against the current value on
    `incident`. Returns only the fields whose value actually changes.
    """
    changes: dict[str, tuple[str | None, str | None]] = {}
    for field in AUDITED_FIELDS:
        if field not in updates:
            continue
        new_raw = updates[field]
        old_raw = getattr(incident, field, None)
        old_str = _to_audit_str(old_raw)
        new_str = _to_audit_str(new_raw)
        if old_str != new_str:
            changes[field] = (old_str, new_str)
    return changes


def initial_audit_entries(
    incident: object,
) -> dict[str, tuple[str | None, str | None]]:
    """
    Build audit changes for the initial creation of OSHA fields.
    Only emits entries for fields that were actually set (non-None).
    old_value is always None for a new record.
    """
    changes: dict[str, tuple[str | None, str | None]] = {}
    for field in AUDITED_FIELDS:
        val = getattr(incident, field, None)
        if val is not None:
            changes[field] = (None, _to_audit_str(val))
    return changes
