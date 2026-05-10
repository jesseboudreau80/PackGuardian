import logging
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.organizations.access import OrgScope, apply_scope, get_org_scope

from .models import Incident
from .schemas import CategoryCount, DashboardSummary

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def get_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> DashboardSummary:
    try:
        incidents = apply_scope(
            db.query(Incident), scope, current_user.tenant_id
        ).all()

        total = len(incidents)
        open_count = sum(1 for i in incidents if i.status == "open")
        effective_sev = lambda i: i.adjusted_severity or i.reported_severity
        critical_count = sum(1 for i in incidents if effective_sev(i) == "critical")

        scored = [i.risk_score for i in incidents if i.risk_score is not None]
        avg_risk = round(sum(scored) / len(scored)) if scored else 0

        category_counts = Counter(
            i.category for i in incidents if i.category and i.category != "General"
        )
        top_categories = [
            CategoryCount(category=cat, count=cnt)
            for cat, cnt in category_counts.most_common(3)
        ]

        return DashboardSummary(
            total_incidents=total,
            open_incidents=open_count,
            critical_incidents=critical_count,
            average_risk_score=avg_risk,
            top_risk_categories=top_categories,
        )
    except Exception as exc:
        logger.exception("Failed to compute dashboard summary")
        raise HTTPException(status_code=500, detail="Failed to compute dashboard summary") from exc
