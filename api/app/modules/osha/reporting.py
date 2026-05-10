import logging
import uuid
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.tenant_context import get_tenant_id

from .models import Incident, IncidentAuditLog, OshaLog
from .schemas import AuditEntry, Form300Entry, Form300Log, Form300ASummary, Form301

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/osha", tags=["OSHA Reporting"])


@router.get("/301/{incident_id}", response_model=Form301)
def get_form_301(
    incident_id: UUID,
    db: Session = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
) -> Form301:
    try:
        inc = (
            db.query(Incident)
            .filter(Incident.id == incident_id, Incident.tenant_id == tenant_id)
            .first()
        )
        if not inc:
            raise HTTPException(status_code=404, detail="Incident not found")

        log = (
            db.query(OshaLog)
            .filter(OshaLog.incident_id == incident_id)
            .first()
        )

        return Form301(
            incident_id=inc.id,
            case_number=log.case_number if log else None,
            employee_name=inc.employee_name,
            job_title=inc.job_title,
            center_id=inc.center_id,
            date_of_injury=inc.date_of_injury,
            time_of_injury=inc.time_of_injury,
            incident_type=inc.incident_type,
            body_part=inc.body_part,
            description=inc.description,
            treatment_type=inc.treatment_type,
            days_away=inc.days_away or 0,
            restricted_days=inc.restricted_days or 0,
            recordable=inc.recordable or False,
            created_at=inc.created_at,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to build Form 301 for %s", incident_id)
        raise HTTPException(status_code=500, detail="Failed to build Form 301") from exc


@router.get("/300/{year}", response_model=Form300Log)
def get_form_300(
    year: int,
    center_id: Optional[str] = None,
    db: Session = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
) -> Form300Log:
    try:
        query = (
            db.query(OshaLog, Incident)
            .join(Incident, OshaLog.incident_id == Incident.id)
            .filter(OshaLog.tenant_id == tenant_id, OshaLog.year == year)
        )
        if center_id:
            query = query.filter(OshaLog.center_id == center_id)

        rows = query.order_by(OshaLog.case_number).all()

        entries = [
            Form300Entry(
                case_number=log.case_number,
                employee_name=inc.employee_name,
                job_title=inc.job_title,
                date_of_injury=inc.date_of_injury,
                incident_type=inc.incident_type,
                body_part=inc.body_part,
                days_away=log.days_away,
                restricted_days=log.restricted_days,
                classification=log.classification,
                incident_id=inc.id,
            )
            for log, inc in rows
        ]

        return Form300Log(
            year=year,
            center_id=center_id,
            entries=entries,
            total_cases=len(entries),
        )
    except Exception as exc:
        logger.exception("Failed to build Form 300 for year %s", year)
        raise HTTPException(status_code=500, detail="Failed to build Form 300") from exc


@router.get("/300a/{year}", response_model=Form300ASummary)
def get_form_300a(
    year: int,
    center_id: Optional[str] = None,
    db: Session = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
) -> Form300ASummary:
    try:
        query = db.query(OshaLog).filter(
            OshaLog.tenant_id == tenant_id, OshaLog.year == year
        )
        if center_id:
            query = query.filter(OshaLog.center_id == center_id)

        rows = query.all()

        return Form300ASummary(
            year=year,
            center_id=center_id,
            total_cases=len(rows),
            days_away_cases=sum(1 for r in rows if r.classification == "days_away"),
            restricted_cases=sum(1 for r in rows if r.classification == "restricted"),
            other_cases=sum(1 for r in rows if r.classification == "other"),
            total_days_away=sum(r.days_away for r in rows),
            total_restricted_days=sum(r.restricted_days for r in rows),
        )
    except Exception as exc:
        logger.exception("Failed to build Form 300A for year %s", year)
        raise HTTPException(status_code=500, detail="Failed to build Form 300A") from exc


@router.get("/audit/{incident_id}", response_model=list[AuditEntry])
def get_audit_log(
    incident_id: UUID,
    db: Session = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
) -> list[AuditEntry]:
    try:
        inc = (
            db.query(Incident)
            .filter(Incident.id == incident_id, Incident.tenant_id == tenant_id)
            .first()
        )
        if not inc:
            raise HTTPException(status_code=404, detail="Incident not found")
        rows = (
            db.query(IncidentAuditLog)
            .filter(IncidentAuditLog.incident_id == incident_id)
            .order_by(IncidentAuditLog.changed_at)
            .all()
        )
        return [AuditEntry.model_validate(r) for r in rows]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to fetch audit log for %s", incident_id)
        raise HTTPException(status_code=500, detail="Failed to fetch audit log") from exc
