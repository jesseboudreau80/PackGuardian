"""
Org-scoped access control.

OrgScope is computed once per request and threaded through all query functions
that need it.  Zero-org users retain tenant-wide access for backwards compat.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from fastapi import Depends
from sqlalchemy.orm import Query, Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User

from .models import Organization, OrganizationMember

# Roles that can see every incident in their accessible orgs
_FULL_ACCESS_ROLES = frozenset({
    "admin", "safety", "operations",
    "center_manager", "district_manager", "area_manager",
})

# HR → recordable incidents only
# Benefits → workers-comp treatment types only
# Legal → high or critical severity only
_HR_TREATMENT_TYPES = frozenset({"medical", "emergency_room", "hospitalization"})
_LEGAL_SEVERITIES = frozenset({"high", "critical"})


@dataclass
class OrgScope:
    # None = tenant-wide (no org constraint applied)
    accessible_org_ids: list[uuid.UUID] | None = None
    hr_only: bool = False          # recordable == True
    benefits_only: bool = False    # treatment_type in workers-comp set
    legal_only: bool = False       # adjusted/reported severity in high/critical


def _bfs_descendants(
    db: Session, root_ids: list[uuid.UUID], tenant_id: uuid.UUID
) -> list[uuid.UUID]:
    """BFS expansion of org IDs to include all descendants."""
    if not root_ids:
        return []
    seen: set[uuid.UUID] = set(root_ids)
    queue: list[uuid.UUID] = list(root_ids)
    while queue:
        batch, queue = queue[:200], queue[200:]
        children = (
            db.query(Organization.id)
            .filter(
                Organization.parent_id.in_(batch),
                Organization.tenant_id == tenant_id,
            )
            .all()
        )
        for (cid,) in children:
            if cid not in seen:
                seen.add(cid)
                queue.append(cid)
    return list(seen)


def compute_org_scope(user: User, db: Session) -> OrgScope:
    """
    Compute the OrgScope for a user.
    - System-level admins → unrestricted tenant-wide access.
    - Users with no org memberships → unrestricted tenant-wide access (backwards compat).
    - Users with org memberships → scoped to their orgs + descendants,
      with optional role-based type filters.
    """
    if user.role == "admin":
        return OrgScope()

    memberships = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user.id)
        .all()
    )
    if not memberships:
        return OrgScope()

    direct_ids = [m.organization_id for m in memberships]
    all_ids = _bfs_descendants(db, direct_ids, user.tenant_id)

    roles = {m.role for m in memberships}
    if roles & _FULL_ACCESS_ROLES:
        return OrgScope(accessible_org_ids=all_ids)

    # Restricted roles — determine the union of what they can see
    hr_only = "hr" in roles
    benefits_only = "benefits" in roles
    legal_only = "legal" in roles

    # If a user has BOTH hr and benefits roles, they see the union (neither restriction applies)
    if hr_only and benefits_only:
        hr_only = benefits_only = False

    return OrgScope(
        accessible_org_ids=all_ids,
        hr_only=hr_only and not benefits_only and not legal_only,
        benefits_only=benefits_only and not hr_only and not legal_only,
        legal_only=legal_only and not hr_only and not benefits_only,
    )


def get_org_scope(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrgScope:
    """FastAPI dependency that resolves OrgScope for the authenticated user."""
    return compute_org_scope(current_user, db)


# ── Query helpers ─────────────────────────────────────────────────────────────

def apply_scope(q: Query, scope: OrgScope, tenant_id: uuid.UUID) -> Query:
    """
    Apply tenant filter + optional org and role filters to an Incident query.
    Import this from each query endpoint; do NOT import Incident here (avoid circular deps).
    """
    from app.modules.osha.models import Incident
    from sqlalchemy import and_, or_

    q = q.filter(Incident.tenant_id == tenant_id)

    if scope.accessible_org_ids is not None:
        q = q.filter(Incident.organization_id.in_(scope.accessible_org_ids))

    if scope.hr_only:
        q = q.filter(Incident.recordable == True)  # noqa: E712

    if scope.benefits_only:
        q = q.filter(Incident.treatment_type.in_(list(_HR_TREATMENT_TYPES)))

    if scope.legal_only:
        q = q.filter(
            or_(
                Incident.adjusted_severity.in_(list(_LEGAL_SEVERITIES)),
                and_(
                    Incident.adjusted_severity.is_(None),
                    Incident.reported_severity.in_(list(_LEGAL_SEVERITIES)),
                ),
            )
        )

    return q
