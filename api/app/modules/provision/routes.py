import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User

from .models import FACILITY_TYPES, TenantInvitation, TenantSettings
from .provisioner import provision_tenant, seed_default_org

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/provision", tags=["Provisioning"])


# ── Schema helpers ─────────────────────────────────────────────────────────────

def _app_base_url() -> str:
    origins = settings.cors_origins
    return origins[0].rstrip("/") if origins else "https://packguardian.app"


class OnboardRequest(BaseModel):
    company_name: str
    admin_email: str
    admin_password: str
    primary_color: str = "#4F46E5"
    secondary_color: str = "#6366F1"
    support_email: str = ""
    facility_type: str | None = None
    is_trial: bool = False


class OnboardResponse(BaseModel):
    tenant_id: uuid.UUID
    admin_user_id: uuid.UUID
    access_token: str
    token_type: str = "bearer"
    is_trial: bool
    trial_expires_at: datetime | None


class OrgNodeInput(BaseModel):
    name: str
    org_type: str
    parent_id: uuid.UUID | None = None


class SettingsUpdate(BaseModel):
    osha_reminder_enabled: bool | None = None
    osha_reminder_lead_days: int | None = None
    default_inspection_cadence_days: int | None = None
    default_escalation_hours: int | None = None
    facility_type: str | None = None


class TenantSettingsRead(BaseModel):
    tenant_id: uuid.UUID
    is_trial: bool
    trial_expires_at: datetime | None
    onboarding_step: int
    onboarding_completed: bool
    facility_type: str | None
    osha_reminder_enabled: bool
    osha_reminder_lead_days: int
    default_inspection_cadence_days: int
    default_escalation_hours: int

    model_config = {"from_attributes": True}


class InviteCreate(BaseModel):
    email: str
    role: str = "manager"
    organization_id: uuid.UUID | None = None


class InviteRead(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    organization_id: uuid.UUID | None
    invite_url: str
    is_accepted: bool
    expires_at: datetime
    created_at: datetime


class AcceptInviteRequest(BaseModel):
    password: str
    full_name: str = ""


class OnboardingStatus(BaseModel):
    step: int
    completed: bool
    is_trial: bool
    trial_expires_at: datetime | None
    checklist: list[dict[str, Any]]


# ══════════════════════════════════════════════════════════════════════════════
# TENANT PROVISIONING  (no auth — creates the first user)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/onboard", response_model=OnboardResponse,
             status_code=status.HTTP_201_CREATED)
def onboard_tenant(
    payload: OnboardRequest,
    db: Session = Depends(get_db),
) -> OnboardResponse:
    """
    Self-service tenant onboarding.  No authentication required.
    Creates a new isolated tenant + admin user in a single atomic transaction.
    """
    # Prevent duplicate email across any tenant
    from app.modules.auth.models import User
    if db.query(User).filter(User.email == payload.admin_email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    if len(payload.admin_password) < 8:
        raise HTTPException(
            status_code=422,
            detail="Password must be at least 8 characters.",
        )

    try:
        tenant, admin, token = provision_tenant(
            db,
            company_name=payload.company_name,
            admin_email=payload.admin_email,
            admin_password=payload.admin_password,
            primary_color=payload.primary_color,
            secondary_color=payload.secondary_color,
            support_email=payload.support_email,
            facility_type=payload.facility_type,
            is_trial=payload.is_trial,
        )
        ts = db.query(TenantSettings).filter(
            TenantSettings.tenant_id == tenant.id
        ).first()
        db.commit()
        logger.info("[packguardian][provision] Tenant provisioned: id=%s name=%s trial=%s",
                    tenant.id, tenant.name, payload.is_trial)
        try:
            from app.services.slack import pg_slack
            pg_slack.tenant_onboarded(
                tenant_name=payload.company_name,
                admin_email=payload.admin_email,
                is_trial=payload.is_trial,
            )
        except Exception:
            pass
        return OnboardResponse(
            tenant_id=tenant.id,
            admin_user_id=admin.id,
            access_token=token,
            is_trial=payload.is_trial,
            trial_expires_at=ts.trial_expires_at if ts else None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("[provision] Tenant provisioning failed")
        raise HTTPException(status_code=500, detail="Provisioning failed") from exc


@router.post("/seed-org", status_code=status.HTTP_201_CREATED)
def seed_org(
    nodes: list[OrgNodeInput],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Step 3: add custom org nodes, or call without a body to get the default
    single-level hierarchy.
    """
    from app.modules.organizations.models import ORG_TYPES, Organization
    if not nodes:
        seed_default_org(db, current_user.tenant_id, current_user.id,
                         "Main Organization")
        db.commit()
        return {"created": "default"}

    created = 0
    for n in nodes:
        if n.org_type not in ORG_TYPES:
            raise HTTPException(status_code=422,
                                detail=f"Invalid org_type: {n.org_type}")
        db.add(Organization(
            tenant_id=current_user.tenant_id,
            name=n.name,
            org_type=n.org_type,
            parent_id=n.parent_id,
        ))
        created += 1
    db.commit()
    return {"created": created}


@router.patch("/settings", response_model=TenantSettingsRead)
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantSettingsRead:
    ts = db.query(TenantSettings).filter(
        TenantSettings.tenant_id == current_user.tenant_id
    ).first()
    if not ts:
        ts = TenantSettings(tenant_id=current_user.tenant_id)
        db.add(ts)

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(ts, field, value)

    db.commit()
    db.refresh(ts)
    return TenantSettingsRead.model_validate(ts)


@router.patch("/step/{step}", response_model=TenantSettingsRead)
def advance_step(
    step: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantSettingsRead:
    """Advance the onboarding wizard step.  Step 5 marks onboarding complete."""
    ts = db.query(TenantSettings).filter(
        TenantSettings.tenant_id == current_user.tenant_id
    ).first()
    if not ts:
        ts = TenantSettings(
            tenant_id=current_user.tenant_id,
            onboarding_step=step,
            onboarding_completed=(step >= 5),
        )
        db.add(ts)
    else:
        ts.onboarding_step = max(ts.onboarding_step, step)
        if step >= 5:
            ts.onboarding_completed = True
    db.commit()
    db.refresh(ts)
    return TenantSettingsRead.model_validate(ts)


@router.get("/settings", response_model=TenantSettingsRead)
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantSettingsRead:
    ts = db.query(TenantSettings).filter(
        TenantSettings.tenant_id == current_user.tenant_id
    ).first()
    if not ts:
        ts = TenantSettings(tenant_id=current_user.tenant_id)
        db.add(ts)
        db.commit()
        db.refresh(ts)
    return TenantSettingsRead.model_validate(ts)


@router.get("/status", response_model=OnboardingStatus)
def get_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OnboardingStatus:
    """Return onboarding checklist state for the first-run welcome dashboard."""
    from app.modules.inspections.models import Inspection
    from app.modules.osha.models import Incident
    from app.modules.organizations.models import Organization
    from app.modules.safety.models import OSHAPosting

    tid = current_user.tenant_id
    ts = db.query(TenantSettings).filter(
        TenantSettings.tenant_id == tid
    ).first()

    has_org = db.query(Organization.id).filter(
        Organization.tenant_id == tid
    ).first() is not None
    has_users = db.query(User).filter(
        User.tenant_id == tid, User.role != "admin"
    ).count() > 0
    has_incident = db.query(Incident.id).filter(
        Incident.tenant_id == tid
    ).first() is not None
    has_inspection = db.query(Inspection.id).filter(
        Inspection.tenant_id == tid
    ).first() is not None
    has_posting = db.query(OSHAPosting.id).filter(
        OSHAPosting.tenant_id == tid
    ).first() is not None
    has_branding = (
        db.query(Organization).first() is not None
    )  # simplified — branding is always set

    checklist = [
        {"id": "account",    "label": "Account created",             "done": True},
        {"id": "branding",   "label": "Branding configured",         "done": True},
        {"id": "org",        "label": "Organization structure added", "done": has_org},
        {"id": "users",      "label": "Team members invited",        "done": has_users},
        {"id": "incident",   "label": "First incident reported",     "done": has_incident},
        {"id": "inspection", "label": "First inspection completed",  "done": has_inspection},
        {"id": "osha",       "label": "OSHA posting configured",     "done": has_posting},
    ]

    return OnboardingStatus(
        step=ts.onboarding_step if ts else 1,
        completed=ts.onboarding_completed if ts else False,
        is_trial=ts.is_trial if ts else False,
        trial_expires_at=ts.trial_expires_at if ts else None,
        checklist=checklist,
    )


# ══════════════════════════════════════════════════════════════════════════════
# INVITATIONS
# ══════════════════════════════════════════════════════════════════════════════

def _invite_read(inv: TenantInvitation) -> InviteRead:
    base = _app_base_url()
    return InviteRead(
        id=inv.id,
        email=inv.email,
        role=inv.role,
        organization_id=inv.organization_id,
        invite_url=f"{base}/join/{inv.token}",
        is_accepted=inv.accepted_at is not None,
        expires_at=inv.expires_at,
        created_at=inv.created_at,
    )


@router.get("/invites", response_model=list[InviteRead])
def list_invites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[InviteRead]:
    rows = db.query(TenantInvitation).filter(
        TenantInvitation.tenant_id == current_user.tenant_id
    ).order_by(TenantInvitation.created_at.desc()).all()
    return [_invite_read(r) for r in rows]


@router.post("/invite", response_model=InviteRead,
             status_code=status.HTTP_201_CREATED)
def create_invite(
    payload: InviteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InviteRead:
    """
    Create a pending invitation.  Returns the invite URL for manual sharing.
    The invited user visits /join/{token} to set up their account.
    """
    # Check for existing active invite for this email+tenant
    existing = db.query(TenantInvitation).filter(
        TenantInvitation.tenant_id == current_user.tenant_id,
        TenantInvitation.email == payload.email,
        TenantInvitation.accepted_at.is_(None),
    ).first()
    if existing and existing.expires_at > datetime.now(timezone.utc):
        return _invite_read(existing)  # return existing pending invite

    inv = TenantInvitation(
        tenant_id=current_user.tenant_id,
        email=payload.email,
        role=payload.role,
        organization_id=payload.organization_id,
        invited_by_user_id=current_user.id,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    logger.info("[packguardian][provision] Invite created: email=%s tenant=%s",
                payload.email, current_user.tenant_id)
    return _invite_read(inv)


@router.delete("/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(
    invite_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    inv = db.query(TenantInvitation).filter(
        TenantInvitation.id == invite_id,
        TenantInvitation.tenant_id == current_user.tenant_id,
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    db.delete(inv)
    db.commit()


@router.get("/invite/{token}", response_model=dict)
def lookup_invite(
    token: str,
    db: Session = Depends(get_db),
) -> dict:
    """Public endpoint — validate an invite token before the user sets their password."""
    inv = db.query(TenantInvitation).filter(
        TenantInvitation.token == token
    ).first()
    if not inv or inv.accepted_at is not None:
        raise HTTPException(status_code=404, detail="Invalid or already accepted invitation")
    if inv.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invitation has expired")

    # Return minimal info (no sensitive data)
    from app.modules.tenant.models import Tenant
    tenant = db.query(Tenant).filter(Tenant.id == inv.tenant_id).first()
    return {
        "email": inv.email,
        "role": inv.role,
        "tenant_name": tenant.name if tenant else "PackGuardian",
        "tenant_primary_color": tenant.primary_color if tenant else "#4F46E5",
        "expires_at": inv.expires_at.isoformat(),
    }


@router.post("/invite/{token}/accept", response_model=dict,
             status_code=status.HTTP_201_CREATED)
def accept_invite(
    token: str,
    payload: AcceptInviteRequest,
    db: Session = Depends(get_db),
) -> dict:
    """
    Accept an invitation: create the user account and return a JWT for immediate login.
    """
    inv = db.query(TenantInvitation).filter(
        TenantInvitation.token == token
    ).first()
    if not inv or inv.accepted_at is not None:
        raise HTTPException(status_code=404, detail="Invalid or already accepted invitation")
    if inv.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invitation has expired")
    if len(payload.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    from app.modules.auth.models import User
    from app.modules.auth.security import create_access_token, hash_password

    # Check email not already used
    if db.query(User).filter(User.email == inv.email).first():
        raise HTTPException(status_code=409, detail="Email already in use")

    user = User(
        email=inv.email,
        password_hash=hash_password(payload.password),
        tenant_id=inv.tenant_id,
        role="manager",
        is_active=True,
    )
    db.add(user)
    db.flush()

    # Assign to org if specified
    if inv.organization_id:
        from app.modules.organizations.models import OrganizationMember
        db.add(OrganizationMember(
            user_id=user.id,
            organization_id=inv.organization_id,
            role=inv.role,
        ))

    inv.accepted_at = datetime.now(timezone.utc)
    db.commit()

    token_str = create_access_token({
        "sub": str(user.id),
        "tenant_id": str(inv.tenant_id),
        "role": "manager",
    })
    logger.info("[packguardian][provision] Invite accepted: email=%s tenant=%s",
                inv.email, inv.tenant_id)
    return {"access_token": token_str, "token_type": "bearer"}


# ══════════════════════════════════════════════════════════════════════════════
# DEMO DATA
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/seed-demo", response_model=dict)
def seed_demo(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Seed realistic enterprise demo data. Admin-only."""
    from .demo import seed_demo_data

    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    try:
        counts = seed_demo_data(db, current_user.tenant_id, current_user.id)
        db.commit()
        logger.info("[packguardian][provision] Demo data seeded tenant=%s",
                    current_user.tenant_id)
        try:
            from app.services.slack import pg_slack
            pg_slack.demo_seeded(
                incidents=counts.get("incidents", 0),
                cases=counts.get("cases", 0),
                centers=counts.get("centers", 0),
            )
        except Exception:
            pass
        return counts
    except Exception as exc:
        db.rollback()
        logger.exception("[provision] Demo seed failed tenant=%s", current_user.tenant_id)
        raise HTTPException(status_code=500, detail="Demo seed failed") from exc


@router.post("/backfill-risk-scores", response_model=dict)
def backfill_risk_scores(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Recompute operational_risk_score for all tenant incidents. Admin-only."""
    from app.modules.osha.models import Incident
    from app.modules.signals.risk_scoring import apply_risk_score

    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    incidents = db.query(Incident).filter(Incident.tenant_id == current_user.tenant_id).all()
    updated = 0
    for inc in incidents:
        try:
            apply_risk_score(db, inc.id, current_user.tenant_id)
            updated += 1
        except Exception:
            pass
    db.commit()
    return {"backfilled": updated}


@router.post("/reset-demo", response_model=dict)
def reset_demo(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Wipe all operational data for this tenant (preserving the calling admin user)
    then re-seed the full enterprise demo. Admin-only.
    """
    from .demo import purge_demo_data, seed_demo_data

    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    # Guard: only run against the designated demo tenant
    from app.core.config import settings
    import uuid as _uuid
    try:
        demo_tid = _uuid.UUID(settings.demo_tenant_id)
    except ValueError:
        demo_tid = None
    if demo_tid and current_user.tenant_id != demo_tid:
        raise HTTPException(
            status_code=403,
            detail="Demo reset is only available on the demo tenant. "
                   "This action would wipe real operational data."
        )
    try:
        purge_demo_data(db, current_user.tenant_id, keep_user_id=current_user.id)
        counts = seed_demo_data(db, current_user.tenant_id, current_user.id)
        db.commit()
        logger.info("[packguardian][provision] Demo data reset tenant=%s",
                    current_user.tenant_id)
        return {"reset": True, **counts}
    except Exception as exc:
        db.rollback()
        logger.exception("[provision] Demo reset failed tenant=%s", current_user.tenant_id)
        raise HTTPException(status_code=500, detail="Demo reset failed") from exc


@router.get("/diagnostics")
def get_diagnostics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Admin-only system diagnostics for support and observability."""
    import sys
    import platform
    from datetime import timedelta
    from sqlalchemy import text

    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    tid = current_user.tenant_id
    now = datetime.now(timezone.utc)

    # DB connection check
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    # Tenant data counts
    from app.modules.osha.models import Incident
    from app.modules.cases.models import IncidentCase
    from app.modules.auth.models import User as UserModel

    incident_count = db.query(Incident).filter(Incident.tenant_id == tid).count()
    case_count     = db.query(IncidentCase).filter(IncidentCase.tenant_id == tid).count()
    user_count     = db.query(UserModel).filter(UserModel.tenant_id == tid).count()

    # CA count
    try:
        from app.modules.corrective_actions.models import CorrectiveAction
        ca_count = db.query(CorrectiveAction).filter(CorrectiveAction.tenant_id == tid).count()
    except Exception:
        ca_count = -1

    # Signal state
    try:
        from app.modules.signals.models import SafetySignal
        active_signals = db.query(SafetySignal).filter(
            SafetySignal.tenant_id == tid,
            SafetySignal.dismissed == False,  # noqa: E712
        ).count()
        last_signal = db.query(SafetySignal).filter(
            SafetySignal.tenant_id == tid,
        ).order_by(SafetySignal.detected_at.desc()).first()
        last_signal_refresh = last_signal.detected_at.isoformat() if last_signal else None
    except Exception:
        active_signals = -1
        last_signal_refresh = None

    # Onboarding state
    try:
        ts = db.query(TenantSettings).filter(TenantSettings.tenant_id == tid).first()
        onboarding_step = ts.onboarding_step if ts else 0
        onboarding_complete = ts.onboarding_completed if ts else False
    except Exception:
        onboarding_step = -1
        onboarding_complete = False

    return {
        "generated_at": now.isoformat(),
        "api_status": "ok",
        "db_connection": db_ok,
        "python_version": sys.version.split()[0],
        "platform": platform.system(),
        "tenant_id": str(tid),
        "data": {
            "incidents": incident_count,
            "cases": case_count,
            "users": user_count,
            "corrective_actions": ca_count,
            "active_signals": active_signals,
            "last_signal_refresh": last_signal_refresh,
        },
        "onboarding": {
            "step": onboarding_step,
            "complete": onboarding_complete,
        },
    }
