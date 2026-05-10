import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.organizations.access import OrgScope, get_org_scope

from .models import (
    INSPECTION_TEMPLATES,
    INSPECTION_TYPES,
    ITEM_RESULTS,
    SEVERITY_DEDUCTION,
    Inspection,
    InspectionItem,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/inspections", tags=["Inspections"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class InspectionItemRead(BaseModel):
    id: uuid.UUID
    inspection_id: uuid.UUID
    sort_order: int
    label: str
    description: str | None
    result: str
    severity: str
    notes: str | None
    evidence_file_id: uuid.UUID | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class InspectionRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    center_code: str
    qr_code_id: uuid.UUID | None
    created_by_user_id: uuid.UUID
    case_id: uuid.UUID | None
    title: str
    inspection_type: str
    status: str
    score: int | None
    notes: str | None
    items: list[InspectionItemRead] = []
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class InspectionCreate(BaseModel):
    center_code: str
    title: str
    inspection_type: str = "general"
    qr_code_id: uuid.UUID | None = None
    notes: str | None = None


class ItemUpdate(BaseModel):
    result: str | None = None  # pass/fail/na
    notes: str | None = None
    evidence_file_id: uuid.UUID | None = None


class CompleteRequest(BaseModel):
    notes: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _compute_score(items: list[InspectionItem]) -> int:
    score = 100
    for item in items:
        if item.result == "fail":
            score -= SEVERITY_DEDUCTION.get(item.severity, 5)
    return max(0, score)


def _get_or_404(db: Session, inspection_id: uuid.UUID, tenant_id: uuid.UUID) -> Inspection:
    row = db.query(Inspection).filter(
        Inspection.id == inspection_id,
        Inspection.tenant_id == tenant_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return row


def _enrich(inspection: Inspection, db: Session) -> InspectionRead:
    items = (
        db.query(InspectionItem)
        .filter(InspectionItem.inspection_id == inspection.id)
        .order_by(InspectionItem.sort_order)
        .all()
    )
    result = InspectionRead.model_validate(inspection)
    result.items = [InspectionItemRead.model_validate(i) for i in items]
    return result


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=dict)
def get_templates() -> dict:
    """Return available inspection types with their default item labels."""
    return {
        t: [{"label": label, "severity": sev}
            for label, sev in items]
        for t, items in INSPECTION_TEMPLATES.items()
    }


@router.get("", response_model=list[InspectionRead])
def list_inspections(
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[InspectionRead]:
    rows = (
        db.query(Inspection)
        .filter(Inspection.tenant_id == current_user.tenant_id)
        .order_by(Inspection.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_enrich(r, db) for r in rows]


@router.post("", response_model=InspectionRead, status_code=status.HTTP_201_CREATED)
def create_inspection(
    payload: InspectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InspectionRead:
    if payload.inspection_type not in INSPECTION_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid type: {payload.inspection_type}")

    inspection = Inspection(
        tenant_id=current_user.tenant_id,
        center_code=payload.center_code,
        qr_code_id=payload.qr_code_id,
        created_by_user_id=current_user.id,
        title=payload.title,
        inspection_type=payload.inspection_type,
        notes=payload.notes,
        status="in_progress",
    )
    db.add(inspection)
    db.flush()

    # Generate default items from template
    template = INSPECTION_TEMPLATES.get(payload.inspection_type, INSPECTION_TEMPLATES["general"])
    for idx, (label, severity) in enumerate(template):
        db.add(InspectionItem(
            inspection_id=inspection.id,
            tenant_id=current_user.tenant_id,
            sort_order=idx,
            label=label,
            severity=severity,
            result="pending",
        ))

    db.commit()
    db.refresh(inspection)
    logger.info("[packguardian][inspect] Created: id=%s center=%s tenant=%s",
                inspection.id, inspection.center_code, current_user.tenant_id)
    return _enrich(inspection, db)


@router.get("/{inspection_id}", response_model=InspectionRead)
def get_inspection(
    inspection_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InspectionRead:
    return _enrich(_get_or_404(db, inspection_id, current_user.tenant_id), db)


@router.patch("/{inspection_id}/items/{item_id}", response_model=InspectionItemRead)
def update_item(
    inspection_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: ItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InspectionItemRead:
    _get_or_404(db, inspection_id, current_user.tenant_id)
    item = db.query(InspectionItem).filter(
        InspectionItem.id == item_id,
        InspectionItem.inspection_id == inspection_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if payload.result and payload.result not in ITEM_RESULTS:
        raise HTTPException(status_code=422, detail=f"Invalid result: {payload.result}")
    if payload.result is not None:
        item.result = payload.result
    if payload.notes is not None:
        item.notes = payload.notes
    if payload.evidence_file_id is not None:
        item.evidence_file_id = payload.evidence_file_id
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return InspectionItemRead.model_validate(item)


@router.post("/{inspection_id}/complete", response_model=InspectionRead)
def complete_inspection(
    inspection_id: uuid.UUID,
    payload: CompleteRequest = CompleteRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InspectionRead:
    """
    Finalise an inspection:
    1. Compute score from pass/fail items.
    2. If critical or multiple major failures → auto-create incident + case.
    3. Broadcast WS event.
    """
    inspection = _get_or_404(db, inspection_id, current_user.tenant_id)
    if inspection.status != "in_progress":
        raise HTTPException(status_code=409, detail="Inspection already completed")

    items = (
        db.query(InspectionItem)
        .filter(InspectionItem.inspection_id == inspection_id)
        .all()
    )

    # Mark any remaining pending items as na
    for item in items:
        if item.result == "pending":
            item.result = "na"

    score = _compute_score(items)
    failed = [i for i in items if i.result == "fail"]
    critical_fails = [i for i in failed if i.severity == "critical"]

    inspection.score = score
    inspection.completed_at = datetime.now(timezone.utc)
    inspection.status = "passed" if not failed else "failed"
    if payload.notes:
        inspection.notes = (inspection.notes or "") + "\n" + payload.notes

    # Auto-create incident + case when critical failures exist
    if failed and not inspection.case_id:
        try:
            case_id = _auto_create_corrective_case(db, inspection, failed, current_user)
            inspection.case_id = case_id
        except Exception as exc:
            logger.warning("[inspections] Corrective case creation failed: %s", exc)

    db.commit()
    db.refresh(inspection)

    # WS broadcast
    try:
        from app.modules.ws.manager import broadcast_sync
        broadcast_sync(f"tenant:{current_user.tenant_id}", {
            "type": "INSPECTION_COMPLETED",
            "inspection_id": str(inspection_id),
            "center_code": inspection.center_code,
            "score": score,
            "status": inspection.status,
            "tenant_id": str(current_user.tenant_id),
            "ts": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass

    logger.info("[packguardian][inspect] Completed: id=%s score=%d status=%s",
                inspection_id, score, inspection.status)
    return _enrich(inspection, db)


def _auto_create_corrective_case(
    db: Session,
    inspection: Inspection,
    failed_items: list[InspectionItem],
    user: User,
) -> uuid.UUID:
    """Create an incident + case for a failed inspection. Returns case_id."""
    from app.modules.osha.models import Incident
    from app.modules.osha.intelligence import analyze
    from app.modules.cases.service import auto_create_case as _auto_case

    critical_count = sum(1 for i in failed_items if i.severity == "critical")
    severity = "critical" if critical_count else "high"

    desc = (
        f"Inspection '{inspection.title}' at {inspection.center_code} "
        f"completed with {len(failed_items)} failed item(s).\n\n"
        "Failed items:\n"
        + "\n".join(
            f"  [{i.severity.upper()}] {i.label}"
            + (f" — {i.notes}" if i.notes else "")
            for i in failed_items[:10]
        )
    )

    intel = analyze("inspection_report", desc, severity)
    adjusted = intel.adjusted_severity if intel.adjusted_severity != severity else None

    incident = Incident(
        center_id=inspection.center_code,
        incident_type="inspection_report",
        description=desc,
        reported_severity=severity,
        status="open",
        category=intel.category,
        risk_score=intel.risk_score,
        recommendations=intel.recommendations,
        adjusted_severity=adjusted,
        explanation=intel.explanation,
        explanation_meta=intel.explanation_meta,
        recordable=False,
        tenant_id=user.tenant_id,
    )
    db.add(incident)
    db.flush()

    from app.modules.osha.schemas import IncidentRead
    incident_read = IncidentRead.model_validate(incident)
    case = _auto_case(db, incident_read, user.id, user.tenant_id)
    db.flush()
    return case.id
