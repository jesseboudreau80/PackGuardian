from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel

OrgType = Literal["enterprise", "area", "district", "center"]
OrgRole = Literal[
    "admin", "safety", "hr", "benefits", "legal",
    "operations", "center_manager", "district_manager", "area_manager",
]


class OrgCreate(BaseModel):
    name: str
    org_type: OrgType
    parent_id: UUID | None = None


class OrgUpdate(BaseModel):
    name: str | None = None
    org_type: OrgType | None = None


class OrgMove(BaseModel):
    parent_id: UUID | None  # None → promote to root


class OrgRead(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    org_type: str
    parent_id: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OrgNode(OrgRead):
    """OrgRead with nested children — used for tree responses."""
    children: list["OrgNode"] = []


class MemberCreate(BaseModel):
    user_id: UUID
    role: OrgRole


class MemberRead(BaseModel):
    id: UUID
    user_id: UUID
    organization_id: UUID
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogRead(BaseModel):
    id: UUID
    tenant_id: UUID
    actor_id: UUID
    action: str
    resource_type: str
    resource_id: UUID | None
    details: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}
