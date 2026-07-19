"""
Workspace profile endpoint.

Returns the authenticated user's role context, org roles, nav configuration,
and terminology overrides in a single call — the client uses this to render
the correct role-specific dashboard without guessing.
"""
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.organizations.models import OrganizationMember

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/workspace", tags=["Workspace"])

# ── Default terminology labels ─────────────────────────────────────────────
# Tenants can override any of these via PATCH /workspace/terminology.

DEFAULT_TERMINOLOGY: dict[str, str] = {
    # Role display names
    "admin":            "Administrator",
    "safety":           "Safety Lead",
    "hr":               "HR Manager",
    "benefits":         "Benefits Coordinator",
    "legal":            "Legal & Compliance",
    "operations":       "Operations Manager",
    "center_manager":   "Center Manager",
    "district_manager": "District Director",
    "area_manager":     "Area Vice President",
    "field_staff":      "Team Member",
    # Org unit names
    "center":    "Center",
    "district":  "District",
    "area":      "Area",
    "enterprise":"Enterprise",
    # Workflow terms
    "incident":          "Incident",
    "corrective_action": "Corrective Action",
    "inspection":        "Inspection",
    "case":              "Case",
}

# ── Role priority for dashboard selection (highest priority first) ──────────
_ROLE_PRIORITY = [
    "area_manager", "district_manager", "center_manager",
    "safety", "hr", "legal", "benefits", "operations",
]


def _get_primary_role(user: User, org_roles: set[str]) -> str:
    """Return the single role that determines the dashboard view."""
    if user.role == "admin":
        return "admin"
    for role in _ROLE_PRIORITY:
        if role in org_roles:
            return role
    # System manager with no org assignment → field staff experience
    if not org_roles:
        return "field_staff"
    return "manager"


def _nav_config(primary_role: str, org_roles: set[str], system_role: str) -> dict:
    """
    Return nav visibility flags.  The frontend uses these to hide irrelevant
    sections, reducing cognitive load for non-admin roles.
    """
    is_admin = system_role == "admin"
    is_safety = "safety" in org_roles
    is_hr = "hr" in org_roles
    is_legal = "legal" in org_roles
    is_district_or_above = bool(org_roles & {"district_manager", "area_manager"})
    is_field_staff = primary_role == "field_staff"

    return {
        "show_command":       is_admin or is_district_or_above or "operations" in org_roles,
        "show_safety_intel":  is_admin or is_safety or is_district_or_above,
        "show_osha":          is_admin or is_safety or is_hr or is_legal,
        "show_cases":         not is_field_staff,
        "show_map":           is_admin or is_safety or is_district_or_above,
        "show_automation":    is_admin,
        "show_field_ops":     True,
        "show_analytics":     is_admin or is_safety,
        "show_organizations": is_admin,
        "show_my_shift":      True,
    }


def _quick_actions(primary_role: str) -> list[dict]:
    """Return the 4-6 most relevant quick actions for this role."""
    actions: dict[str, list[dict]] = {
        "admin": [
            {"label": "Report Incident",     "href": "/mobile/incident", "icon": "⚠️",  "color": "red"    },
            {"label": "Command Center",      "href": "/command",         "icon": "🖥️",   "color": "indigo" },
            {"label": "Safety Intelligence", "href": "/safety",          "icon": "🛡️",   "color": "purple" },
            {"label": "OSHA Reports",        "href": "/osha",            "icon": "📋",  "color": "blue"   },
            {"label": "Case Management",     "href": "/cases",           "icon": "📁",  "color": "orange" },
            {"label": "Manage Users",        "href": "/settings/users",  "icon": "👥",  "color": "gray"   },
        ],
        "manager": [
            {"label": "Report Incident",     "href": "/mobile/incident", "icon": "⚠️",  "color": "red"   },
            {"label": "My Cases",            "href": "/cases",           "icon": "📁",  "color": "indigo"},
            {"label": "My Work Queue",       "href": "/work",            "icon": "📋",  "color": "blue"  },
            {"label": "OSHA Reports",        "href": "/osha",            "icon": "📋",  "color": "green" },
        ],
        "safety": [
            {"label": "Safety Dashboard",    "href": "/safety",          "icon": "🛡️",   "color": "purple"},
            {"label": "OSHA Reports",        "href": "/osha",            "icon": "📋",  "color": "blue"  },
            {"label": "Report Incident",     "href": "/mobile/incident", "icon": "⚠️",  "color": "red"   },
            {"label": "Case Management",     "href": "/cases",           "icon": "📁",  "color": "indigo"},
            {"label": "Audit Search",        "href": "/osha/search",     "icon": "🔍",  "color": "gray"  },
        ],
        "hr": [
            {"label": "Employee Injuries",   "href": "/osha/search",     "icon": "🧑‍⚕️", "color": "red"   },
            {"label": "Review Cases",        "href": "/cases",           "icon": "📁",  "color": "indigo"},
            {"label": "OSHA Reports",        "href": "/osha",            "icon": "📋",  "color": "blue"  },
            {"label": "OSHA Search",         "href": "/osha/search",     "icon": "🔍",  "color": "gray"  },
        ],
        "center_manager": [
            {"label": "Report Incident",     "href": "/mobile/incident", "icon": "⚠️",  "color": "red"   },
            {"label": "Active Cases",        "href": "/cases",           "icon": "📁",  "color": "indigo"},
            {"label": "My Work Queue",       "href": "/work",            "icon": "📋",  "color": "blue"  },
            {"label": "OSHA Reports",        "href": "/osha",            "icon": "📋",  "color": "green" },
        ],
        "district_manager": [
            {"label": "District Overview",   "href": "/command",         "icon": "🖥️",   "color": "indigo"},
            {"label": "Risk Map",            "href": "/map",             "icon": "🗺️",   "color": "blue"  },
            {"label": "Escalations",         "href": "/cases",           "icon": "⬆",   "color": "orange"},
            {"label": "OSHA Reports",        "href": "/osha",            "icon": "📋",  "color": "gray"  },
        ],
        "area_manager": [
            {"label": "Area Command",        "href": "/command",         "icon": "🖥️",   "color": "indigo"},
            {"label": "Risk Intelligence",   "href": "/safety",          "icon": "🛡️",   "color": "purple"},
            {"label": "Risk Map",            "href": "/map",             "icon": "🗺️",   "color": "blue"  },
            {"label": "OSHA Summary",        "href": "/osha",            "icon": "📋",  "color": "gray"  },
        ],
        "operations": [
            {"label": "Work Queue",          "href": "/work",            "icon": "📋",  "color": "blue"  },
            {"label": "Active Cases",        "href": "/cases",           "icon": "📁",  "color": "indigo"},
            {"label": "Report Incident",     "href": "/mobile/incident", "icon": "⚠️",  "color": "red"   },
            {"label": "OSHA Reports",        "href": "/osha",            "icon": "📋",  "color": "green" },
        ],
        "legal": [
            {"label": "OSHA Review Queue",   "href": "/osha",            "icon": "⚖️",  "color": "blue"  },
            {"label": "Audit Search",        "href": "/osha/search",     "icon": "🔍",  "color": "gray"  },
            {"label": "Case Review",         "href": "/cases",           "icon": "📁",  "color": "indigo"},
            {"label": "Annual Postings",     "href": "/osha/postings",   "icon": "📋",  "color": "green" },
        ],
        "field_staff": [
            {"label": "Report Incident",     "href": "/mobile/incident", "icon": "⚠️",  "color": "red"   },
            {"label": "My Follow-Ups",       "href": "/work",            "icon": "📋",  "color": "blue"  },
            {"label": "Scan Case QR",        "href": "/mobile/scan",     "icon": "📷",  "color": "indigo"},
        ],
    }
    fallback = actions.get("manager")
    return actions.get(primary_role, fallback)


# ── Schemas ────────────────────────────────────────────────────────────────

class WorkspaceProfile(BaseModel):
    role_context: str           # display label, e.g. "Center Manager"
    primary_role: str           # machine key, e.g. "center_manager"
    org_roles: list[str]
    system_role: str            # "admin" | "manager"
    is_admin: bool
    terminology: dict[str, str]
    nav: dict[str, bool]
    quick_actions: list[dict[str, Any]]
    # Guidance copy for empty states
    dashboard_title: str
    dashboard_subtitle: str


class TerminologyUpdate(BaseModel):
    overrides: dict[str, str]


# ── Routes ────────────────────────────────────────────────────────────────

@router.get("/profile", response_model=WorkspaceProfile)
def get_workspace_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkspaceProfile:
    org_roles_rows = db.query(OrganizationMember.role).filter(
        OrganizationMember.user_id == current_user.id
    ).all()
    org_roles = {r.role for r in org_roles_rows}

    primary_role = _get_primary_role(current_user, org_roles)

    # Merge default terminology with any tenant overrides
    from app.modules.provision.models import TenantSettings
    ts = db.query(TenantSettings).filter(
        TenantSettings.tenant_id == current_user.tenant_id
    ).first()
    tenant_overrides: dict[str, str] = (ts.terminology or {}) if ts else {}
    terminology = {**DEFAULT_TERMINOLOGY, **tenant_overrides}

    role_display = terminology.get(primary_role, primary_role.replace("_", " ").title())

    _SUBTITLES = {
        "admin":            "Full platform access · All modules enabled",
        "safety":           "OSHA compliance · Hazard tracking · Safety intelligence",
        "hr":               "Employee injury queue · Workers comp · Return-to-work",
        "legal":            "OSHA defensibility · Case review · Audit trail · Documentation integrity",
        "center_manager":   "Center-level incidents · Corrective actions · Daily operations",
        "district_manager": "District risk oversight · Center comparison · Escalation management",
        "area_manager":     "Area-wide intelligence · OSHA trends · Enterprise risk",
        "operations":       "Work queue · Case management · Operational workflows",
        "manager":          "Operational safety platform",
        "field_staff":      "Report incidents · Track your reports · Respond to follow-ups",
    }

    return WorkspaceProfile(
        role_context=role_display,
        primary_role=primary_role,
        org_roles=list(org_roles),
        system_role=current_user.role,
        is_admin=current_user.role == "admin",
        terminology=terminology,
        nav=_nav_config(primary_role, org_roles, current_user.role),
        quick_actions=_quick_actions(primary_role),
        dashboard_title=f"Welcome back — {role_display}",
        dashboard_subtitle=_SUBTITLES.get(primary_role, "PackGuardian Operational Safety Platform"),
    )


@router.patch("/terminology", response_model=dict)
def update_terminology(
    payload: TerminologyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Admin only: update tenant-level terminology overrides."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    from app.modules.provision.models import TenantSettings
    ts = db.query(TenantSettings).filter(
        TenantSettings.tenant_id == current_user.tenant_id
    ).first()
    if not ts:
        ts = TenantSettings(tenant_id=current_user.tenant_id)
        db.add(ts)
    ts.terminology = {**(ts.terminology or {}), **payload.overrides}
    db.commit()
    return {"updated": len(payload.overrides)}
