import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user, require_admin
from app.modules.auth.models import User

from .audit import log as audit_log
from .models import ORG_ROLES, ORG_TYPES, OrgAuditLog, Organization, OrganizationMember
from .schemas import (
    AuditLogRead,
    MemberCreate,
    MemberRead,
    OrgCreate,
    OrgMove,
    OrgNode,
    OrgRead,
    OrgUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/organizations", tags=["Organizations"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_org_or_404(db: Session, org_id: uuid.UUID, tenant_id: uuid.UUID) -> Organization:
    org = db.query(Organization).filter(
        Organization.id == org_id,
        Organization.tenant_id == tenant_id,
    ).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _would_create_cycle(
    db: Session,
    org_id: uuid.UUID,
    new_parent_id: uuid.UUID | None,
    tenant_id: uuid.UUID,
) -> bool:
    """Return True if setting new_parent_id would create a cycle in the tree."""
    if new_parent_id is None:
        return False
    if new_parent_id == org_id:
        return True
    # Walk up from new_parent until we hit root or find org_id
    cursor: uuid.UUID | None = new_parent_id
    visited: set[uuid.UUID] = set()
    while cursor is not None:
        if cursor in visited or cursor == org_id:
            return True
        visited.add(cursor)
        row = db.query(Organization.parent_id).filter(
            Organization.id == cursor,
            Organization.tenant_id == tenant_id,
        ).first()
        cursor = row[0] if row else None
    return False


def _build_tree(orgs: list[Organization]) -> list[OrgNode]:
    """Build a nested tree from a flat list of org rows."""
    nodes = {o.id: OrgNode.model_validate(o) for o in orgs}
    roots: list[OrgNode] = []
    for node in nodes.values():
        if node.parent_id and node.parent_id in nodes:
            nodes[node.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots


# ── Organization CRUD ─────────────────────────────────────────────────────────

@router.get("", response_model=list[OrgNode])
def list_organizations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OrgNode]:
    orgs = (
        db.query(Organization)
        .filter(Organization.tenant_id == current_user.tenant_id)
        .order_by(Organization.name)
        .all()
    )
    return _build_tree(orgs)


@router.get("/flat", response_model=list[OrgRead])
def list_organizations_flat(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OrgRead]:
    """Flat list — useful for parent selectors in UI."""
    orgs = (
        db.query(Organization)
        .filter(Organization.tenant_id == current_user.tenant_id)
        .order_by(Organization.name)
        .all()
    )
    return [OrgRead.model_validate(o) for o in orgs]


@router.post("", response_model=OrgRead, status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrgCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> OrgRead:
    if payload.org_type not in ORG_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid org_type: {payload.org_type}")
    if payload.parent_id:
        _get_org_or_404(db, payload.parent_id, admin.tenant_id)

    org = Organization(
        tenant_id=admin.tenant_id,
        name=payload.name,
        org_type=payload.org_type,
        parent_id=payload.parent_id,
    )
    db.add(org)
    audit_log(
        db,
        tenant_id=admin.tenant_id,
        actor_id=admin.id,
        action="org_created",
        resource_type="organization",
        resource_id=org.id,
        details={"name": payload.name, "org_type": payload.org_type, "parent_id": str(payload.parent_id) if payload.parent_id else None},
    )
    db.commit()
    db.refresh(org)
    logger.info("[packguardian][org] Created org=%s name=%s tenant=%s", org.id, org.name, org.tenant_id)
    return OrgRead.model_validate(org)


@router.patch("/{org_id}", response_model=OrgRead)
def update_organization(
    org_id: uuid.UUID,
    payload: OrgUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> OrgRead:
    org = _get_org_or_404(db, org_id, admin.tenant_id)
    changes: dict = {}
    if payload.name is not None:
        changes["name"] = {"old": org.name, "new": payload.name}
        org.name = payload.name
    if payload.org_type is not None and payload.org_type not in ORG_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid org_type: {payload.org_type}")
    if payload.org_type is not None:
        changes["org_type"] = {"old": org.org_type, "new": payload.org_type}
        org.org_type = payload.org_type
    if changes:
        audit_log(db, tenant_id=admin.tenant_id, actor_id=admin.id,
                  action="org_updated", resource_type="organization",
                  resource_id=org_id, details=changes)
    db.commit()
    db.refresh(org)
    return OrgRead.model_validate(org)


@router.patch("/{org_id}/parent", response_model=OrgRead)
def move_organization(
    org_id: uuid.UUID,
    payload: OrgMove,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> OrgRead:
    org = _get_org_or_404(db, org_id, admin.tenant_id)
    if payload.parent_id:
        _get_org_or_404(db, payload.parent_id, admin.tenant_id)
    if _would_create_cycle(db, org_id, payload.parent_id, admin.tenant_id):
        raise HTTPException(status_code=422, detail="Move would create a cycle in the hierarchy")
    old_parent = org.parent_id
    org.parent_id = payload.parent_id
    audit_log(db, tenant_id=admin.tenant_id, actor_id=admin.id,
              action="org_moved", resource_type="organization", resource_id=org_id,
              details={"old_parent_id": str(old_parent) if old_parent else None,
                       "new_parent_id": str(payload.parent_id) if payload.parent_id else None})
    db.commit()
    db.refresh(org)
    logger.info("[packguardian][org] Moved org=%s new_parent=%s tenant=%s", org_id, payload.parent_id, admin.tenant_id)
    return OrgRead.model_validate(org)


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_organization(
    org_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    org = _get_org_or_404(db, org_id, admin.tenant_id)
    # Check for children — refuse to delete a non-leaf node
    has_children = db.query(Organization.id).filter(
        Organization.parent_id == org_id,
        Organization.tenant_id == admin.tenant_id,
    ).first()
    if has_children:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete an organization that has children. Move or delete children first.",
        )
    audit_log(db, tenant_id=admin.tenant_id, actor_id=admin.id,
              action="org_deleted", resource_type="organization", resource_id=org_id,
              details={"name": org.name, "org_type": org.org_type})
    db.delete(org)
    db.commit()
    logger.info("[packguardian][org] Deleted org=%s tenant=%s", org_id, admin.tenant_id)


# ── Member management ─────────────────────────────────────────────────────────

@router.get("/{org_id}/members", response_model=list[MemberRead])
def list_members(
    org_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MemberRead]:
    _get_org_or_404(db, org_id, current_user.tenant_id)
    rows = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.organization_id == org_id)
        .order_by(OrganizationMember.created_at)
        .all()
    )
    return [MemberRead.model_validate(r) for r in rows]


@router.post("/{org_id}/members", response_model=MemberRead, status_code=status.HTTP_201_CREATED)
def add_member(
    org_id: uuid.UUID,
    payload: MemberCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MemberRead:
    _get_org_or_404(db, org_id, current_user.tenant_id)
    if payload.role not in ORG_ROLES:
        raise HTTPException(status_code=422, detail=f"Invalid role: {payload.role}")

    from sqlalchemy.exc import IntegrityError
    existing = db.query(OrganizationMember).filter(
        OrganizationMember.user_id == payload.user_id,
        OrganizationMember.organization_id == org_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="User is already a member of this organization")

    member = OrganizationMember(
        user_id=payload.user_id,
        organization_id=org_id,
        role=payload.role,
    )
    db.add(member)
    audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
              action="role_assigned", resource_type="org_membership",
              resource_id=org_id,
              details={"user_id": str(payload.user_id), "role": payload.role})
    db.commit()
    db.refresh(member)
    logger.info("[packguardian][org] Member added: user=%s org=%s role=%s by=%s",
                payload.user_id, org_id, payload.role, current_user.id)
    return MemberRead.model_validate(member)


@router.delete("/{org_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    _get_org_or_404(db, org_id, current_user.tenant_id)
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
              action="role_removed", resource_type="org_membership",
              resource_id=org_id,
              details={"user_id": str(user_id), "role": member.role})
    db.delete(member)
    db.commit()
    logger.info("[packguardian][org] Member removed: user=%s org=%s by=%s", user_id, org_id, current_user.id)


# ── Audit log ─────────────────────────────────────────────────────────────────

@router.get("/audit-log", response_model=list[AuditLogRead])
def get_audit_log(
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[AuditLogRead]:
    rows = (
        db.query(OrgAuditLog)
        .filter(OrgAuditLog.tenant_id == admin.tenant_id)
        .order_by(OrgAuditLog.created_at.desc())
        .limit(min(limit, 500))
        .all()
    )
    return [AuditLogRead.model_validate(r) for r in rows]
