"""
Tenant resolution dependency.

All route handlers call Depends(get_tenant_id) to get the active tenant.
Changing get_tenant_id is the only thing needed to swap tenant resolution strategies.
"""
import uuid

from fastapi import Depends

from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User


def get_tenant_id(current_user: User = Depends(get_current_user)) -> uuid.UUID:
    """Extract tenant_id from the authenticated user's JWT claim."""
    return current_user.tenant_id
