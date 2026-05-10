"""
PackGuardian Safety & OSHA Compliance routes.

Covers:
  - OSHA record retention (29 CFR 1904.33)
  - Annual posting workflow (Form 300A)
  - Data exports (CSV / ZIP bundle)
  - OSHA audit search
  - Safety intelligence dashboard
"""
import csv
import io
import logging
import uuid
import zipfile
from collections import Counter
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.inspections.models import Inspection
from app.modules.osha.models import Incident, OshaLog
from app.modules.organizations.access import OrgScope, apply_scope, get_org_scope
from app.modules.organizations.audit import log as audit_log

from .models import OSHA_FORM_TYPES, OSHAPosting, OSHARetentionRecord, _retention_expires

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/safety", tags=["Safety & OSHA"])


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _current_year() -> int:
    return datetime.now(timezone.utc).year


# ══════════════════════════════════════════════════════════════════════════════
# OSHA RECORD RETENTION
# ══════════════════════════════════════════════════════════════════════════════

class RetentionRecordRead(BaseModel):
    id: uuid.UUID
    incident_id: uuid.UUID
    osha_log_id: uuid.UUID | None
    osha_form_type: str
    calendar_year: int
    finalized_at: datetime | None
    retention_expires_at: datetime
    archived: bool
    archive_location: str | None
    created_at: datetime
    days_remaining: int  # computed

    model_config = {"from_attributes": True}


def _days_remaining(record: OSHARetentionRecord) -> int:
    delta = record.retention_expires_at - datetime.now(timezone.utc)
    return max(0, delta.days)


@router.get("/retention", response_model=list[RetentionRecordRead])
def list_retention_records(
    year: Annotated[int | None, Query()] = None,
    expiring_within_days: Annotated[int | None, Query()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[RetentionRecordRead]:
    q = db.query(OSHARetentionRecord).filter(
        OSHARetentionRecord.tenant_id == current_user.tenant_id
    )
    if year:
        q = q.filter(OSHARetentionRecord.calendar_year == year)
    if expiring_within_days:
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) + timedelta(days=expiring_within_days)
        q = q.filter(OSHARetentionRecord.retention_expires_at <= cutoff)
    rows = q.order_by(OSHARetentionRecord.retention_expires_at).all()
    return [RetentionRecordRead(
        **{k: getattr(r, k) for k in RetentionRecordRead.model_fields if k != "days_remaining"},
        days_remaining=_days_remaining(r)
    ) for r in rows]


@router.post("/retention/sync", response_model=dict)
def sync_retention_records(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Backfill / sync retention records for all OSHA logs that don't yet have
    retention tracking.  Idempotent — safe to call repeatedly.
    """
    existing_incident_ids = {
        r.incident_id
        for r in db.query(OSHARetentionRecord.incident_id)
        .filter(OSHARetentionRecord.tenant_id == current_user.tenant_id)
        .all()
    }
    logs = db.query(OshaLog).filter(
        OshaLog.tenant_id == current_user.tenant_id
    ).all()
    created = 0
    for log in logs:
        if log.incident_id in existing_incident_ids:
            continue
        for form_type in OSHA_FORM_TYPES:
            db.add(OSHARetentionRecord(
                tenant_id=current_user.tenant_id,
                incident_id=log.incident_id,
                osha_log_id=log.id,
                osha_form_type=form_type,
                calendar_year=log.year,
                retention_expires_at=_retention_expires(log.year),
            ))
        created += 1
    db.commit()
    logger.info("[packguardian][safety] Retention sync: created=%d tenant=%s",
                created, current_user.tenant_id)
    return {"synced": created}


@router.patch("/retention/{record_id}/archive", response_model=RetentionRecordRead)
def archive_retention_record(
    record_id: uuid.UUID,
    archive_location: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RetentionRecordRead:
    rec = db.query(OSHARetentionRecord).filter(
        OSHARetentionRecord.id == record_id,
        OSHARetentionRecord.tenant_id == current_user.tenant_id,
    ).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Retention record not found")
    rec.archived = True
    rec.archive_location = archive_location
    audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
              action="incident_modified", resource_type="osha_retention",
              resource_id=record_id, details={"archive_location": archive_location})
    db.commit()
    db.refresh(rec)
    return RetentionRecordRead(
        **{k: getattr(rec, k) for k in RetentionRecordRead.model_fields if k != "days_remaining"},
        days_remaining=_days_remaining(rec)
    )


# ══════════════════════════════════════════════════════════════════════════════
# OSHA POSTING WORKFLOW
# ══════════════════════════════════════════════════════════════════════════════

class PostingRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    center_code: str | None
    year: int
    generated_at: datetime
    posted_at: datetime | None
    posted_by_user_id: uuid.UUID | None
    acknowledgement_notes: str | None
    form_300a_snapshot: dict[str, Any] | None
    is_posted: bool

    model_config = {"from_attributes": True}


@router.get("/postings", response_model=list[PostingRead])
def list_postings(
    year: Annotated[int | None, Query()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PostingRead]:
    q = db.query(OSHAPosting).filter(OSHAPosting.tenant_id == current_user.tenant_id)
    if year:
        q = q.filter(OSHAPosting.year == year)
    rows = q.order_by(OSHAPosting.year.desc(), OSHAPosting.generated_at.desc()).all()
    return [PostingRead(
        **{k: getattr(r, k) for k in PostingRead.model_fields if k != "is_posted"},
        is_posted=r.posted_at is not None,
    ) for r in rows]


@router.post("/postings/{year}", response_model=PostingRead,
             status_code=status.HTTP_201_CREATED)
def generate_posting(
    year: int,
    center_code: Annotated[str | None, Query()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PostingRead:
    """
    Generate a Form 300A summary snapshot for the given year and create a
    posting record.  The snapshot is immutable — edits to underlying incidents
    after posting do not affect the archived posting data.
    """
    q = db.query(OshaLog).filter(
        OshaLog.tenant_id == current_user.tenant_id,
        OshaLog.year == year,
    )
    if center_code:
        q = q.filter(OshaLog.center_id == center_code)
    rows = q.all()

    snapshot = {
        "year": year,
        "center_code": center_code,
        "total_cases": len(rows),
        "days_away_cases": sum(1 for r in rows if r.classification == "days_away"),
        "restricted_cases": sum(1 for r in rows if r.classification == "restricted"),
        "other_cases": sum(1 for r in rows if r.classification == "other"),
        "total_days_away": sum(r.days_away for r in rows),
        "total_restricted_days": sum(r.restricted_days for r in rows),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": str(current_user.id),
    }

    posting = OSHAPosting(
        tenant_id=current_user.tenant_id,
        center_code=center_code,
        year=year,
        form_300a_snapshot=snapshot,
    )
    db.add(posting)
    audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
              action="incident_modified", resource_type="osha_posting",
              resource_id=posting.id,
              details={"year": year, "center_code": center_code, "total_cases": len(rows)})
    db.commit()
    db.refresh(posting)
    logger.info("[packguardian][safety] OSHA posting generated year=%d tenant=%s",
                year, current_user.tenant_id)
    return PostingRead(
        **{k: getattr(posting, k) for k in PostingRead.model_fields if k != "is_posted"},
        is_posted=False,
    )


@router.patch("/postings/{posting_id}/mark-posted", response_model=PostingRead)
def mark_posted(
    posting_id: uuid.UUID,
    notes: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PostingRead:
    posting = db.query(OSHAPosting).filter(
        OSHAPosting.id == posting_id,
        OSHAPosting.tenant_id == current_user.tenant_id,
    ).first()
    if not posting:
        raise HTTPException(status_code=404, detail="Posting not found")
    posting.posted_at = datetime.now(timezone.utc)
    posting.posted_by_user_id = current_user.id
    posting.acknowledgement_notes = notes or None
    audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
              action="incident_modified", resource_type="osha_posting",
              resource_id=posting_id, details={"op": "marked_posted", "notes": notes})
    db.commit()
    db.refresh(posting)
    logger.info("[packguardian][safety] OSHA posting confirmed year=%d tenant=%s",
                posting.year, current_user.tenant_id)
    return PostingRead(
        **{k: getattr(posting, k) for k in PostingRead.model_fields if k != "is_posted"},
        is_posted=True,
    )


# ══════════════════════════════════════════════════════════════════════════════
# OSHA AUDIT SEARCH
# ══════════════════════════════════════════════════════════════════════════════

class OSHASearchResult(BaseModel):
    incident_id: uuid.UUID
    case_number: int | None
    center_id: str
    year: int | None
    employee_name: str | None
    job_title: str | None
    incident_type: str
    date_of_injury: Any
    classification: str | None
    days_away: int
    restricted_days: int
    recordable: bool | None
    is_finalized: bool
    category: str | None
    risk_score: int | None


@router.get("/search", response_model=list[OSHASearchResult])
def osha_audit_search(
    employee: Annotated[str | None, Query()] = None,
    center: Annotated[str | None, Query()] = None,
    year: Annotated[int | None, Query()] = None,
    classification: Annotated[str | None, Query()] = None,
    recordable_only: Annotated[bool, Query()] = False,
    finalized_only: Annotated[bool, Query()] = False,
    q: Annotated[str | None, Query(min_length=2)] = None,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> list[OSHASearchResult]:
    """
    Full-text + filter search across OSHA incident records.
    Respects org scope for data isolation.
    """
    incident_q = apply_scope(db.query(Incident), scope, current_user.tenant_id)

    if employee:
        incident_q = incident_q.filter(Incident.employee_name.ilike(f"%{employee}%"))
    if center:
        incident_q = incident_q.filter(Incident.center_id.ilike(f"%{center}%"))
    if recordable_only:
        incident_q = incident_q.filter(Incident.recordable == True)  # noqa: E712
    if finalized_only:
        incident_q = incident_q.filter(Incident.is_finalized == True)  # noqa: E712
    if q:
        incident_q = incident_q.filter(
            or_(
                Incident.description.ilike(f"%{q}%"),
                Incident.incident_type.ilike(f"%{q}%"),
                Incident.employee_name.ilike(f"%{q}%"),
                Incident.body_part.ilike(f"%{q}%"),
            )
        )

    incidents = (
        incident_q.order_by(Incident.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Build lookup of osha_log data
    incident_ids = [i.id for i in incidents]
    logs = {
        log.incident_id: log
        for log in db.query(OshaLog).filter(OshaLog.incident_id.in_(incident_ids)).all()
    }

    results: list[OSHASearchResult] = []
    for inc in incidents:
        log = logs.get(inc.id)

        # Year filter (applied in Python against osha_log data)
        if year and (log is None or log.year != year):
            continue
        if classification and (log is None or log.classification != classification):
            continue

        results.append(OSHASearchResult(
            incident_id=inc.id,
            case_number=log.case_number if log else None,
            center_id=inc.center_id,
            year=log.year if log else None,
            employee_name=inc.employee_name,
            job_title=inc.job_title,
            incident_type=inc.incident_type,
            date_of_injury=inc.date_of_injury,
            classification=log.classification if log else None,
            days_away=log.days_away if log else 0,
            restricted_days=log.restricted_days if log else 0,
            recordable=inc.recordable,
            is_finalized=inc.is_finalized,
            category=inc.category,
            risk_score=inc.risk_score,
        ))

    return results


# ══════════════════════════════════════════════════════════════════════════════
# EXPORT ENGINE
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/export/300/{year}/csv")
def export_form_300_csv(
    year: int,
    center_code: Annotated[str | None, Query()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Export OSHA Form 300 log as CSV for the given year."""
    q = (
        db.query(OshaLog, Incident)
        .join(Incident, OshaLog.incident_id == Incident.id)
        .filter(OshaLog.tenant_id == current_user.tenant_id, OshaLog.year == year)
    )
    if center_code:
        q = q.filter(OshaLog.center_id == center_code)
    rows = q.order_by(OshaLog.case_number).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Case Number", "Employee Name", "Job Title", "Date of Injury",
        "Center", "Incident Type", "Body Part",
        "Classification", "Days Away", "Restricted Days",
    ])
    for log, inc in rows:
        writer.writerow([
            log.case_number,
            inc.employee_name or "",
            inc.job_title or "",
            str(inc.date_of_injury) if inc.date_of_injury else "",
            inc.center_id,
            inc.incident_type,
            inc.body_part or "",
            log.classification,
            log.days_away,
            log.restricted_days,
        ])

    buf.seek(0)
    filename = f"OSHA_300_{year}{f'_{center_code}' if center_code else ''}.csv"
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/300a/{year}/csv")
def export_form_300a_csv(
    year: int,
    center_code: Annotated[str | None, Query()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Export OSHA Form 300A summary as CSV."""
    q = db.query(OshaLog).filter(
        OshaLog.tenant_id == current_user.tenant_id, OshaLog.year == year
    )
    if center_code:
        q = q.filter(OshaLog.center_id == center_code)
    rows = q.all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Field", "Value"])
    writer.writerow(["Year", year])
    writer.writerow(["Center", center_code or "All"])
    writer.writerow(["Total Recordable Cases", len(rows)])
    writer.writerow(["Days Away from Work Cases",
                     sum(1 for r in rows if r.classification == "days_away")])
    writer.writerow(["Job Transfer / Restriction Cases",
                     sum(1 for r in rows if r.classification == "restricted")])
    writer.writerow(["Other Recordable Cases",
                     sum(1 for r in rows if r.classification == "other")])
    writer.writerow(["Total Days Away", sum(r.days_away for r in rows)])
    writer.writerow(["Total Restricted Days", sum(r.restricted_days for r in rows)])

    buf.seek(0)
    filename = f"OSHA_300A_{year}{f'_{center_code}' if center_code else ''}.csv"
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/bundle/{year}")
def export_bundle(
    year: int,
    center_code: Annotated[str | None, Query()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    ZIP bundle containing Form 300 CSV, Form 300A CSV, and a retention manifest.
    Built entirely in memory — no filesystem writes.
    """
    def _build_300_csv() -> str:
        q = (
            db.query(OshaLog, Incident)
            .join(Incident, OshaLog.incident_id == Incident.id)
            .filter(OshaLog.tenant_id == current_user.tenant_id, OshaLog.year == year)
        )
        if center_code:
            q = q.filter(OshaLog.center_id == center_code)
        rows = q.order_by(OshaLog.case_number).all()
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Case Number","Employee Name","Job Title","Date of Injury",
                    "Center","Incident Type","Body Part","Classification",
                    "Days Away","Restricted Days"])
        for log, inc in rows:
            w.writerow([log.case_number, inc.employee_name or "", inc.job_title or "",
                        str(inc.date_of_injury) if inc.date_of_injury else "",
                        inc.center_id, inc.incident_type, inc.body_part or "",
                        log.classification, log.days_away, log.restricted_days])
        return buf.getvalue()

    def _build_300a_csv() -> str:
        q = db.query(OshaLog).filter(
            OshaLog.tenant_id == current_user.tenant_id, OshaLog.year == year
        )
        if center_code:
            q = q.filter(OshaLog.center_id == center_code)
        rows = q.all()
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Field", "Value"])
        w.writerow(["Year", year])
        w.writerow(["Center", center_code or "All"])
        w.writerow(["Total Recordable Cases", len(rows)])
        w.writerow(["Days Away Cases",
                    sum(1 for r in rows if r.classification == "days_away")])
        w.writerow(["Restricted Cases",
                    sum(1 for r in rows if r.classification == "restricted")])
        w.writerow(["Other Cases",
                    sum(1 for r in rows if r.classification == "other")])
        w.writerow(["Total Days Away", sum(r.days_away for r in rows)])
        w.writerow(["Total Restricted Days", sum(r.restricted_days for r in rows)])
        return buf.getvalue()

    def _build_manifest() -> str:
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Form Type","Retention Expires","Archived","Archive Location"])
        records = db.query(OSHARetentionRecord).filter(
            OSHARetentionRecord.tenant_id == current_user.tenant_id,
            OSHARetentionRecord.calendar_year == year,
        ).all()
        for r in records:
            w.writerow([r.osha_form_type,
                        r.retention_expires_at.strftime("%Y-%m-%d"),
                        "Yes" if r.archived else "No",
                        r.archive_location or ""])
        return buf.getvalue()

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"OSHA_300_{year}.csv", _build_300_csv().encode("utf-8-sig"))
        zf.writestr(f"OSHA_300A_{year}.csv", _build_300a_csv().encode("utf-8-sig"))
        zf.writestr(f"OSHA_RetentionManifest_{year}.csv",
                    _build_manifest().encode("utf-8-sig"))
        zf.writestr("README.txt",
                    f"PackGuardian OSHA Compliance Bundle\nYear: {year}\n"
                    f"Center: {center_code or 'All'}\n"
                    f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n"
                    "Retain per 29 CFR 1904.33 for 5 years from calendar year end.")

    zip_buf.seek(0)
    filename = f"PackGuardian_OSHA_{year}.zip"
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ══════════════════════════════════════════════════════════════════════════════
# SAFETY INTELLIGENCE
# ══════════════════════════════════════════════════════════════════════════════

class SafetyIntelligenceResponse(BaseModel):
    year: int
    # OSHA recordable summary
    recordable_count: int
    lost_time_cases: int
    restricted_cases: int
    total_days_away: int
    total_restricted_days: int
    # Trends
    prior_year_recordables: int
    yoy_change_pct: float | None
    # Risk patterns
    top_injury_types: list[dict[str, Any]]
    repeat_hazard_categories: list[dict[str, Any]]
    high_risk_centers: list[dict[str, Any]]
    # Operational
    unresolved_corrective_actions: int
    inspection_pass_rate: float | None
    open_incidents_count: int


@router.get("/intelligence", response_model=SafetyIntelligenceResponse)
def get_safety_intelligence(
    year: Annotated[int, Query()] = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> SafetyIntelligenceResponse:
    """
    Safety-focused intelligence dashboard.
    Covers OSHA recordables, lost time, repeat hazards, and operational risk.
    """
    if not year:
        year = _current_year()
    tid = current_user.tenant_id

    # ── OSHA recordable metrics ───────────────────────────────────────────────
    logs_this_year = db.query(OshaLog).filter(
        OshaLog.tenant_id == tid, OshaLog.year == year
    ).all()
    logs_prior_year = db.query(OshaLog).filter(
        OshaLog.tenant_id == tid, OshaLog.year == year - 1
    ).all()

    recordable_count = len(logs_this_year)
    lost_time_cases = sum(1 for l in logs_this_year if l.classification == "days_away")
    restricted_cases = sum(1 for l in logs_this_year if l.classification == "restricted")
    total_days_away = sum(l.days_away for l in logs_this_year)
    total_restricted_days = sum(l.restricted_days for l in logs_this_year)
    prior_year_recordables = len(logs_prior_year)

    if prior_year_recordables > 0:
        yoy_change_pct = round(
            ((recordable_count - prior_year_recordables) / prior_year_recordables) * 100, 1
        )
    elif recordable_count > 0:
        yoy_change_pct = None  # no baseline
    else:
        yoy_change_pct = 0.0

    # ── Top injury types (from recordable incidents) ──────────────────────────
    recordable_incident_ids = [l.incident_id for l in logs_this_year]
    recordable_incidents = (
        db.query(Incident)
        .filter(Incident.id.in_(recordable_incident_ids))
        .all()
    ) if recordable_incident_ids else []

    type_counter = Counter(i.incident_type for i in recordable_incidents)
    top_injury_types = [
        {"incident_type": t, "count": c}
        for t, c in type_counter.most_common(5)
    ]

    # ── Repeat hazards (categories with 2+ recordable incidents) ─────────────
    cat_counter = Counter(
        i.category for i in recordable_incidents if i.category and i.category != "General"
    )
    repeat_hazard_categories = [
        {"category": cat, "count": cnt}
        for cat, cnt in cat_counter.most_common(5)
        if cnt >= 2
    ]

    # ── High-risk centers (most recordables this year) ────────────────────────
    center_counter = Counter(l.center_id for l in logs_this_year)
    high_risk_centers = [
        {"center_code": center, "recordable_count": cnt}
        for center, cnt in center_counter.most_common(5)
    ]

    # ── Unresolved corrective actions (open cases from inspections) ───────────
    from app.modules.cases.models import IncidentCase
    from app.modules.inspections.models import Inspection
    failed_inspection_case_ids = [
        i.case_id for i in db.query(Inspection).filter(
            Inspection.tenant_id == tid,
            Inspection.case_id.isnot(None),
        ).all()
    ]
    unresolved_corrective_actions = db.query(IncidentCase).filter(
        IncidentCase.id.in_(failed_inspection_case_ids),
        IncidentCase.status.notin_(["resolved", "closed"]),
    ).count() if failed_inspection_case_ids else 0

    # ── Inspection pass rate ──────────────────────────────────────────────────
    completed = db.query(Inspection).filter(
        Inspection.tenant_id == tid,
        Inspection.status.in_(["passed", "failed"]),
    ).count()
    passed = db.query(Inspection).filter(
        Inspection.tenant_id == tid,
        Inspection.status == "passed",
    ).count()
    inspection_pass_rate = round((passed / completed) * 100, 1) if completed > 0 else None

    # ── Open incidents (all, org-scoped) ─────────────────────────────────────
    open_incidents_count = (
        apply_scope(db.query(func.count(Incident.id)), scope, tid)
        .filter(Incident.status == "open")
        .scalar()
    ) or 0

    return SafetyIntelligenceResponse(
        year=year,
        recordable_count=recordable_count,
        lost_time_cases=lost_time_cases,
        restricted_cases=restricted_cases,
        total_days_away=total_days_away,
        total_restricted_days=total_restricted_days,
        prior_year_recordables=prior_year_recordables,
        yoy_change_pct=yoy_change_pct,
        top_injury_types=top_injury_types,
        repeat_hazard_categories=repeat_hazard_categories,
        high_risk_centers=high_risk_centers,
        unresolved_corrective_actions=unresolved_corrective_actions,
        inspection_pass_rate=inspection_pass_rate,
        open_incidents_count=open_incidents_count,
    )
