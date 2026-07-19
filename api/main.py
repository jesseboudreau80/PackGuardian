import logging
import logging.config
import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import Base, engine
from app.modules.auth import models as _auth_models  # noqa: F401 — registers User model
from app.modules.auth.routes import router as auth_router
from app.modules.auth.user_routes import router as users_router
from app.modules.automation import models as _automation_models  # noqa: F401 — registers AutomationEvent
from app.modules.automation.routes import router as automation_router
from app.modules.cases import models as _case_models  # noqa: F401 — registers IncidentCase, IncidentTask, IncidentComment, CaseTimeline
from app.modules.cases.routes import router as cases_router
from app.modules.evidence import models as _evidence_models  # noqa: F401 — registers EvidenceFile, EvidenceNote
from app.modules.evidence.routes import router as evidence_router
from app.modules.integrations import models as _integration_models  # noqa: F401 — registers IntegrationRef, IntegrationWebhook
from app.modules.integrations.routes import router as integrations_router
from app.modules.provision import models as _provision_models  # noqa: F401 — registers TenantSettings, TenantInvitation
from app.modules.provision.routes import router as provision_router
from app.modules.workspace.routes import router as workspace_router
from app.modules.inspections import models as _inspection_models  # noqa: F401 — registers Inspection, InspectionItem
from app.modules.safety import models as _safety_models  # noqa: F401 — registers OSHARetentionRecord, OSHAPosting
from app.modules.safety.routes import router as safety_router
from app.modules.inspections.routes import router as inspections_router
from app.modules.mobile.routes import router as mobile_router
from app.modules.qr import models as _qr_models  # noqa: F401 — registers QRCode
from app.modules.qr.routes import router as qr_router
from app.modules.hub.routes import router_command, router_search, router_work
from app.modules.notifications import models as _notification_models  # noqa: F401 — registers Notification
from app.modules.notifications.routes import router as notifications_router
from app.modules.ws.routes import router as ws_router
from app.modules.ai.routes import router as ai_router
from app.modules.osha import models as _osha_models  # noqa: F401 — registers ORM models
from app.modules.osha.analytics import router as analytics_router
from app.modules.osha.dashboard import router as dashboard_router
from app.modules.osha.reporting import router as reporting_router
from app.modules.osha.routes import router as osha_router
from app.modules.tenant import models as _tenant_models  # noqa: F401 — registers Tenant model
from app.modules.map import models as _map_models  # noqa: F401 — registers Center model
from app.modules.map.routes import router as map_router
from app.modules.organizations import models as _org_models  # noqa: F401 — registers Organization, OrganizationMember, OrgAuditLog
from app.modules.organizations.routes import router as organizations_router
from app.modules.tenant.routes import router as tenant_router
from app.modules.corrective_actions import models as _ca_models  # noqa: F401 — registers CorrectiveAction
from app.modules.corrective_actions.routes import router as ca_router
from app.modules.witness import models as _witness_models  # noqa: F401 — registers WitnessStatement
from app.modules.witness.routes import router as witness_router
from app.modules.signals import models as _signal_models  # noqa: F401 — registers SafetySignal
from app.modules.signals.routes import router as signals_router
from app.modules.internal.routes import router as internal_router

# ── Logging ───────────────────────────────────────────────────────────────────
_log_file = os.getenv("LOG_FILE")
_handlers: dict = {
    "console": {
        "class": "logging.StreamHandler",
        "formatter": "default",
        "stream": "ext://sys.stdout",
    },
}
if _log_file:
    _handlers["file"] = {
        "class": "logging.FileHandler",
        "formatter": "default",
        "filename": _log_file,
        "encoding": "utf-8",
    }

logging.config.dictConfig(
    {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"}
        },
        "handlers": _handlers,
        "root": {"handlers": list(_handlers.keys()), "level": "INFO"},
    }
)

logger = logging.getLogger(__name__)


# ── DB startup validation ─────────────────────────────────────────────────────
def _dev_create_db() -> None:
    """Dev mode only: connect to the postgres default DB and create the target DB."""
    from sqlalchemy import create_engine as _make_engine
    from sqlalchemy.engine import make_url

    url = make_url(settings.database_url)
    db_name = url.database
    admin_url = url.set(database="postgres")
    try:
        admin_engine = _make_engine(admin_url, isolation_level="AUTOCOMMIT")
        with admin_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": db_name}
            ).fetchone()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))
                logger.info("[packguardian] Dev mode: created database '%s'", db_name)
            else:
                logger.info("[packguardian] Dev mode: database '%s' already exists", db_name)
    except Exception as exc:
        logger.critical(
            "[packguardian] Dev mode: failed to auto-create database '%s'. Error: %s",
            db_name,
            exc,
        )
        sys.exit(1)
    finally:
        admin_engine.dispose()


def _validate_db() -> None:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return
    except Exception as exc:
        if settings.env == "dev":
            logger.warning(
                "[packguardian] Dev mode: DB unreachable, attempting auto-create. Error: %s", exc
            )
            _dev_create_db()
            try:
                with engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
            except Exception as exc2:
                logger.critical(
                    "[packguardian] Database connection failed after auto-create. "
                    "PackGuardian cannot start. Error: %s",
                    exc2,
                )
                sys.exit(1)
        else:
            logger.critical(
                "[packguardian] Database connection failed. PackGuardian cannot start. Error: %s",
                exc,
            )
            sys.exit(1)


_validate_db()

# Fail loudly if JWT secret is still the default — protects against lost .env on redeploy
if settings.jwt_secret == "CHANGE-THIS-SECRET-IN-PRODUCTION":
    logger.critical(
        "[packguardian] JWT_SECRET is using the insecure default. "
        "Set JWT_SECRET in api/.env before running in any environment."
    )
    sys.exit(1)

Base.metadata.create_all(bind=engine)


def _migrate_add_is_active() -> None:
    """Idempotent: add is_active to users if it was created before this column existed."""
    with engine.connect() as conn:
        conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS"
                " is_active BOOLEAN NOT NULL DEFAULT true"
            )
        )
        conn.commit()


_migrate_add_is_active()


def _migrate_add_incident_org() -> None:
    """Idempotent: add organization_id to incidents for org-scoped access control."""
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS organization_id UUID"
        ))
        conn.commit()


_migrate_add_incident_org()


def _migrate_tenant_settings_terminology() -> None:
    """Idempotent: add terminology JSONB column to tenant_settings if it doesn't exist."""
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS terminology JSONB"
        ))
        conn.commit()


_migrate_tenant_settings_terminology()


def _migrate_incident_risk_fields() -> None:
    """Idempotent: add extended risk fields to incidents table."""
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS operational_risk_score INTEGER",
            "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS risk_contributors JSONB",
            "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS signal_count INTEGER DEFAULT 0",
            "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS risk_band VARCHAR",
            "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS last_risk_evaluation_at TIMESTAMPTZ",
        ]:
            conn.execute(text(stmt))
        conn.commit()


_migrate_incident_risk_fields()


def _seed_default_tenant() -> None:
    from app.core.database import SessionLocal
    from app.modules.tenant.models import DEFAULT_TENANT_ID, Tenant

    with SessionLocal() as db:
        if not db.query(Tenant).first():
            db.add(
                Tenant(
                    id=DEFAULT_TENANT_ID,
                    name="PackGuardian",
                    primary_color="#4F46E5",
                    secondary_color="#6366F1",
                    theme="light",
                    support_email="support@packguardian.com",
                )
            )
            db.commit()
            logger.info("[packguardian] Default tenant seeded.")


_seed_default_tenant()


def _seed_default_admin() -> None:
    from app.core.database import SessionLocal
    from app.modules.auth.models import User
    from app.modules.auth.security import hash_password
    from app.modules.tenant.models import DEFAULT_TENANT_ID

    with SessionLocal() as db:
        if not db.query(User).first():
            db.add(
                User(
                    email="admin@packguardian.com",
                    password_hash=hash_password("changeme"),
                    tenant_id=DEFAULT_TENANT_ID,
                    role="admin",
                )
            )
            db.commit()
            logger.warning(
                "[packguardian] Default admin seeded — "
                "email: admin@packguardian.com  password: changeme  "
                "CHANGE THIS PASSWORD BEFORE GOING TO PRODUCTION"
            )


_seed_default_admin()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title=settings.app_name, version=settings.app_version)


@app.on_event("startup")
async def _capture_event_loop() -> None:
    """Store the running event loop so sync route handlers can schedule WS broadcasts."""
    import asyncio
    from app.modules.ws.manager import set_loop
    set_loop(asyncio.get_running_loop())

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(osha_router)
app.include_router(dashboard_router)
app.include_router(analytics_router)
app.include_router(reporting_router)
app.include_router(tenant_router)
app.include_router(map_router)
app.include_router(automation_router)
app.include_router(organizations_router)
app.include_router(cases_router)
app.include_router(router_work)
app.include_router(router_command)
app.include_router(router_search)
app.include_router(notifications_router)
app.include_router(evidence_router)
app.include_router(inspections_router)
app.include_router(safety_router)
app.include_router(integrations_router)
app.include_router(provision_router)
app.include_router(workspace_router)
app.include_router(mobile_router)
app.include_router(qr_router)
app.include_router(ws_router)
app.include_router(ai_router)
app.include_router(ca_router)
app.include_router(witness_router)
app.include_router(signals_router)
app.include_router(internal_router)


@app.get("/")
def root():
    return {"service": settings.app_name, "version": settings.app_version}


@app.get("/health")
def health():
    return {"status": "ok", "service": "packguardian", "version": settings.app_version}


@app.get("/whoami")
def whoami():
    """Identity endpoint — confirms which app is bound to this port."""
    return {
        "app":         "PackGuardian API",
        "version":     settings.app_version,
        "port":        8105,
        "environment": "production",
        "owner":       "jesse",
    }


@app.get("/.well-known/aegis-meta")
def aegis_meta():
    """Aegis Pack Specification V2 — machine-readable identity and capability declaration."""
    import os
    from datetime import datetime, timezone
    return {
        "pack_id":              "packguardian",
        "pack_name":            "PackGuardian",
        "version":              settings.app_version,
        "environment":          "production",
        "frontend_port":        3005,
        "backend_port":         8105,
        "auth_required":        True,
        "governance_enabled":   True,
        "replay_supported":     False,
        "observability_supported": True,
        "systemd_service":      "packguardian.service",
        "tunnel_name":          "reselleros",
        "public_url":           "https://packguardian.jesseboudreau.com",
        "api_url":              "https://packguardian-api.jesseboudreau.com",
        "health_endpoint":      "/health",
        "meta_endpoint":        "/.well-known/aegis-meta",
        "uptime_s":             None,
        "build_sha":            os.environ.get("GIT_SHA", None),
        "reported_at":          datetime.now(timezone.utc).isoformat(),
        "owner":                "jesse",
        "doctrine_version":     "2026-05-30",
        "runtime_type":         "nextjs+fastapi",
        "stack":                {"frontend": "Next.js 15", "backend": "FastAPI", "db": "PostgreSQL"},
        "capabilities":         [
            "osha_compliance",
            "incident_management",
            "case_management",
            "corrective_actions",
            "safety_intelligence",
            "qr_case_tracking",
            "safety_tips",
            "multi_tenant",
            "role_hierarchy",
            "websocket_events",
            "slack_lab_channel",
        ],
        "slack_channel":        "packguardian-lab",
        "aegis_integrations": {
            "iris_channel":     "packguardian-lab",
            "event_emission":   False,
            "hermes_memory":    False,
            "pack_registered":  False,
        },
    }
