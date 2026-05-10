import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user, require_admin
from app.modules.auth.models import User
from app.modules.osha.models import Incident
from app.modules.organizations.access import OrgScope, apply_scope, get_org_scope

from .heat import compute_heat
from .models import Center
from .schemas import CenterCreate, CenterHeat, CenterRead

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/map", tags=["Map"])

Timeframe = Literal["7d", "30d", "90d", "all"]

_TIMEFRAME_DAYS: dict[str, int | None] = {
    "7d":  7,
    "30d": 30,
    "90d": 90,
    "all": None,
}


def _since(timeframe: str) -> datetime | None:
    days = _TIMEFRAME_DAYS.get(timeframe)
    if days is None:
        return None
    return datetime.now(timezone.utc) - timedelta(days=days)


# ── Heat endpoint ─────────────────────────────────────────────────────────────

@router.get("/heat", response_model=list[CenterHeat])
def get_heat(
    timeframe: Annotated[Timeframe, Query()] = "30d",
    recordable_only: Annotated[bool, Query()] = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> list[CenterHeat]:
    """
    Returns heat data for every registered center in the tenant.
    Incidents are filtered by timeframe, OSHA-recordable flag, and org scope.
    JWT required; tenant isolation enforced via current_user.tenant_id.
    """
    try:
        tenant_id = current_user.tenant_id
        since = _since(timeframe)
        now = datetime.now(timezone.utc)

        centers = (
            db.query(Center)
            .filter(Center.tenant_id == tenant_id)
            .order_by(Center.name)
            .all()
        )
        if not centers:
            return []

        q = apply_scope(db.query(Incident), scope, tenant_id)
        if since is not None:
            q = q.filter(Incident.created_at >= since)
        if recordable_only:
            q = q.filter(Incident.recordable == True)  # noqa: E712
        all_incidents: list[Incident] = q.all()

        # Group by center_code
        by_center: dict[str, list[Incident]] = {c.center_code: [] for c in centers}
        for inc in all_incidents:
            if inc.center_id in by_center:
                by_center[inc.center_id].append(inc)

        results: list[CenterHeat] = []
        for center in centers:
            incidents = by_center[center.center_code]
            heat = compute_heat(incidents, now=now)
            results.append(
                CenterHeat(
                    center_id=center.center_code,
                    name=center.name,
                    lat=center.latitude,
                    lng=center.longitude,
                    incident_count=len(incidents),
                    **heat,
                )
            )

        # Sort hottest first
        results.sort(key=lambda c: -c.heat_score)
        return results

    except Exception as exc:
        logger.exception("[packguardian][map] Failed to compute heat data tenant=%s", current_user.tenant_id)
        raise HTTPException(status_code=500, detail="Failed to compute heat data") from exc


# ── Center management ─────────────────────────────────────────────────────────

@router.get("/centers", response_model=list[CenterRead])
def list_centers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CenterRead]:
    centers = (
        db.query(Center)
        .filter(Center.tenant_id == current_user.tenant_id)
        .order_by(Center.name)
        .all()
    )
    return [CenterRead.model_validate(c) for c in centers]


@router.post("/centers", response_model=CenterRead, status_code=status.HTTP_201_CREATED)
def create_center(
    payload: CenterCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> CenterRead:
    existing = (
        db.query(Center)
        .filter(
            Center.tenant_id == admin.tenant_id,
            Center.center_code == payload.center_code,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Center '{payload.center_code}' already exists for this tenant",
        )
    center = Center(
        tenant_id=admin.tenant_id,
        center_code=payload.center_code,
        name=payload.name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        address=payload.address,
        city=payload.city,
        state=payload.state,
    )
    db.add(center)
    db.commit()
    db.refresh(center)
    logger.info(
        "[packguardian][map] Center created: code=%s name=%s tenant=%s by_admin=%s",
        center.center_code,
        center.name,
        center.tenant_id,
        admin.id,
    )
    return CenterRead.model_validate(center)


@router.delete("/centers/{center_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_center(
    center_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    center = (
        db.query(Center)
        .filter(Center.id == center_id, Center.tenant_id == admin.tenant_id)
        .first()
    )
    if not center:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Center not found")
    logger.info(
        "[packguardian][map] Center deleted: code=%s name=%s tenant=%s by_admin=%s",
        center.center_code,
        center.name,
        center.tenant_id,
        admin.id,
    )
    db.delete(center)
    db.commit()
