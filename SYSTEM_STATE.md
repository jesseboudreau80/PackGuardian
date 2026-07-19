# PackGuardian — System State

> Architectural continuity document for engineers and AI assistants.  
> Last updated: 2026-05-10. Keep this current when major modules are added or restructured.

---

## What PackGuardian IS

PackGuardian is an **operational safety and OSHA compliance platform** built for multi-location pet care operations (kennels, daycares, groomers, boarding facilities, veterinary practices).

**Core domains:**
- Incident reporting, triage, and investigation
- OSHA 300/301/300A form automation and recordability logic
- Inspection management with scored checklists and corrective action creation
- Case management: assignment, escalation, tasks, comments, timeline
- Evidence collection with rule-based intelligence (PDFs, photos, documents)
- Field operations: mobile-optimised shift dashboards, QR-code-triggered inspections
- Safety intelligence: risk scoring, pattern analysis, emerging hazard detection
- Multi-tenant white-label deployment with role-based org hierarchy

---

## What PackGuardian IS NOT

PackGuardian does **not** own:
- Enterprise AI governance or policy lifecycle management → **Aegis AI**
- Licensing master tracking or credential management → **DP DVM Map** or dedicated licensing system
- Broad multi-domain compliance governance (employment law, state licensing, DEA compliance) → ecosystem apps
- HR as a primary system of record (employee data lives externally; PackGuardian stores only injury-relevant fields)

The `integrations` module exists to push safety events to Aegis AI and DP DVM Map via webhooks. PackGuardian does **not** pull governance or licensing data from them.

---

## Product Scope at a Glance

| In scope | Out of scope |
|---|---|
| Workplace injury tracking | Employment law compliance |
| OSHA 300/301/300A automation | State business licensing |
| Inspection checklist scoring | DEA registration tracking |
| Case investigation workflow | Broad HR policy management |
| Evidence intelligence (safety signals) | Enterprise AI governance |
| Field staff mobile ops | Financial or payroll systems |
| Multi-location risk mapping | Credentialing / licensing master |
| Org hierarchy access control | |
| Corrective action tracking | |
| Realtime incident broadcasts | |

---

## Repository Layout

```
packguardian/
├── api/                     # FastAPI backend
│   ├── .env                 # Required — never committed
│   ├── .env.example         # Template
│   ├── .venv/               # Python virtual environment (created by start.sh)
│   ├── main.py              # App entrypoint, router registration, seed functions
│   ├── requirements.txt
│   └── app/
│       ├── core/
│       │   ├── config.py    # pydantic-settings Settings object
│       │   ├── database.py  # SQLAlchemy engine, SessionLocal, Base, get_db
│       │   └── tenant_context.py  # get_tenant_id FastAPI dependency
│       └── modules/         # One directory per domain module
│           ├── auth/
│           ├── automation/
│           ├── cases/
│           ├── evidence/
│           ├── hub/
│           ├── inspections/
│           ├── integrations/
│           ├── map/
│           ├── mobile/
│           ├── notifications/
│           ├── organizations/
│           ├── osha/
│           ├── provision/
│           ├── qr/
│           ├── safety/
│           ├── tenant/
│           ├── workspace/
│           └── ws/
├── web/                     # Next.js 15 App Router frontend
│   └── app/
│       ├── layout.tsx       # Root layout with all providers
│       ├── page.tsx         # Role-contextual dashboard
│       ├── context/         # AuthContext, TenantContext, WorkspaceContext
│       ├── components/      # Shared UI components
│       ├── automation/
│       ├── cases/
│       ├── command/
│       ├── login/
│       ├── map/
│       ├── mobile/
│       ├── onboard/
│       ├── organizations/
│       ├── osha/
│       ├── safety/
│       ├── settings/
│       ├── welcome/
│       └── work/
├── start.sh                 # Staged service startup
├── stop.sh                  # Process teardown
└── SYSTEM_STATE.md          # This file
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| API framework | FastAPI 0.119 |
| ORM | SQLAlchemy 2.0 (mapped_column style) |
| Database | PostgreSQL via psycopg2-binary |
| Schema validation | Pydantic v2 (`from_attributes=True`) |
| Auth | JWT via python-jose, passwords via passlib/bcrypt |
| Frontend | Next.js 15, App Router, TypeScript, Tailwind CSS |
| Realtime | WebSocket (FastAPI native) |
| Tunnel | Cloudflare Tunnel (`packguardian` named tunnel) |
| Runtime | Python .venv in `api/.venv`; Node via system npm |

---

## Backend Architecture

### Module Structure

Every domain module follows the same layout:

```
modules/<domain>/
├── __init__.py
├── models.py     # SQLAlchemy ORM models — imported in main.py for registration
├── schemas.py    # Pydantic v2 schemas (request/response)
├── routes.py     # FastAPI router — registered in main.py
└── service.py    # Business logic (when non-trivial)
```

Some modules add `analysis.py` (evidence), `intelligence.py` (osha), `audit.py` (osha), `dashboard.py` (osha), `analytics.py` (osha), `reporting.py` (osha), `access.py` (organizations).

### Database Conventions

- All tables use UUID primary keys (`uuid4`, PostgreSQL native UUID type)
- All tables carry `tenant_id: UUID` (NOT NULL, indexed) — see Tenant Isolation below
- `created_at` / `updated_at` set via Python `default=lambda: datetime.now(timezone.utc)`
- Boolean columns always use `server_default="false"` or `"true"` to avoid migration gaps on column addition
- Nullable columns + `server_default` are the standard backward-compatible schema evolution pattern — no Alembic migrations yet; idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` functions in `main.py` handle one-time additions
- JSONB used for `recommendations`, `explanation_meta`, `payload`, `details`, `target_metadata`, `terminology`
- Append-only tables never get UPDATE or DELETE: `IncidentAuditLog`, `OrgAuditLog`, `CaseTimeline`

### Dependency Injection Chain

```
get_current_user          (OAuth2PasswordBearer → decode JWT → lookup User row)
  └── get_tenant_id       (returns current_user.tenant_id)
        └── all routes    (all data endpoints — tenant_id threaded through service calls)

get_org_scope             (calls compute_org_scope → BFS org tree expansion)
  └── routes that need    (command, work queue, search, mobile shift)
      org-level filtering
```

Changing `get_tenant_id` to `Depends(get_current_user)` was the single change point that protected every route simultaneously.

---

## Authentication System (`modules/auth/`)

| File | Responsibility |
|---|---|
| `models.py` | `User`: id, email, password_hash, tenant_id (UUID, NOT NULL), role, is_active, created_at |
| `security.py` | Pure crypto: `hash_password`, `verify_password` (bcrypt), `create_access_token`, `decode_token` (HS256 JWT) |
| `dependencies.py` | `oauth2_scheme`, `get_current_user`, `require_admin` FastAPI dependencies |
| `routes.py` | `POST /auth/login` → `TokenResponse`; `GET /auth/me` → `UserRead` |
| `user_routes.py` | User management: create, list, deactivate (admin only) |
| `schemas.py` | `LoginRequest`, `TokenResponse`, `UserRead` |

**JWT payload:** `{sub: user_id, tenant_id, role, exp}`  
**Token expiry:** 24 hours (configurable via `jwt_expire_hours`)  
**Default admin seed:** `admin@packguardian.com` / `changeme` — seeded only if no users exist; logs at WARNING level on every startup until replaced.

**Role system:**
- `admin` — full platform access, manage users, manage tenant config
- `manager` — default operational role
- Org-level roles (stored in `organization_members`): `safety`, `hr`, `benefits`, `legal`, `operations`, `center_manager`, `district_manager`, `area_manager`
- System role (`User.role`) and org role (`OrganizationMember.role`) are separate concepts

---

## Tenant System (`modules/tenant/` + `modules/provision/`)

### Tenant Model (`modules/tenant/models.py`)
```
Tenant: id (UUID), name, logo_url, primary_color, secondary_color, theme, support_email, support_phone
DEFAULT_TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
```

### Tenant Routes
- `GET /tenant` — **public** (used by login page before auth, for branding)
- `GET /tenant/me` — auth required
- `PUT /tenant` — admin only
- `POST /tenant/theme` — admin only

### TenantSettings (`modules/provision/models.py`)
Extended per-tenant settings (one row per tenant):
- Onboarding: `is_trial`, `trial_expires_at`, `onboarding_step`, `onboarding_completed`, `facility_type`
- OSHA defaults: `osha_reminder_enabled`, `osha_reminder_lead_days`, `default_inspection_cadence_days`, `default_escalation_hours`
- Terminology overrides: `terminology` (JSONB `{key: label}` map)

### Tenant Isolation Rule
Every query on every data table MUST filter by `tenant_id`. The `get_tenant_id` dependency enforces this transitively — a route that omits `Depends(get_tenant_id)` is a bug. The `apply_scope()` helper in `organizations/access.py` applies both tenant filter and org filter in one call.

---

## Org Hierarchy (`modules/organizations/`)

### Data model
```
Organization: id, tenant_id, name, org_type (enterprise|area|district|center), parent_id (self-ref, nullable=root)
OrganizationMember: user_id, organization_id, role (unique constraint on pair)
OrgAuditLog: append-only, tenant_id, actor_id, action, resource_type, resource_id, details
```

Org types form a four-level tree: `enterprise → area → district → center`

### OrgScope (access control)

`OrgScope` is computed once per request by `get_org_scope`:

- **Admin** → `OrgScope()` — unrestricted tenant-wide access
- **No org memberships** → `OrgScope()` — tenant-wide fallback (backwards compat)
- **Org members with full-access roles** (`safety`, `operations`, `center_manager`, `district_manager`, `area_manager`) → BFS-expanded org tree (org + all descendants)
- **HR role** → same orgs, but `hr_only=True` → only `recordable=True` incidents
- **Benefits role** → `benefits_only=True` → only workers-comp treatment types
- **Legal role** → `legal_only=True` → only high/critical severity

`apply_scope(query, scope, tenant_id)` in `organizations/access.py` translates `OrgScope` into SQLAlchemy filters.

---

## OSHA Module (`modules/osha/`)

The original and primary module. Phase 1 complete.

### Files
| File | Purpose |
|---|---|
| `models.py` | `Incident`, `OshaLog`, `IncidentAuditLog` |
| `service.py` | Create/list/update/finalize incidents; all functions take explicit `tenant_id` |
| `intelligence.py` | Pure rule-based engine: classify → severity adjust → risk score → recommendations → explanation |
| `audit.py` | Append-only audit helpers for OSHA-critical fields |
| `routes.py` | `POST /incidents`, `GET /incidents`, `PATCH /incidents/{id}`, `POST /incidents/{id}/finalize` |
| `dashboard.py` | `GET /dashboard/summary` |
| `analytics.py` | `GET /analytics/patterns` — keyword frequencies, transitions, clusters, emerging risks |
| `reporting.py` | `GET /osha/301/{id}`, `GET /osha/300/{year}`, `GET /osha/300a/{year}`, `GET /osha/audit/{id}` |
| `schemas.py` | All Pydantic schemas; `ExplanationMeta` must be defined before `IncidentCreate`/`IncidentRead` |

### Incident Model Key Fields
- `reported_severity` — stored as DB column `severity`; user's original input, never overwritten
- `adjusted_severity` — intelligence engine output; shown as "Reported: X → Adjusted: Y"
- `explanation` — human-readable string of matched rules
- `explanation_meta` — JSONB structured metadata: `{matched_keywords, escalation_keywords, category_confidence, severity_transition}`
- `is_finalized` — lock; once `True`, OSHA fields block further PATCH with 409
- `organization_id` — org scoping; NULL = tenant-wide visibility

### Intelligence Engine (`intelligence.py`)
Pure function `analyze(incident_type, description, severity) → IntelligenceResult`
- `_classify()` → `(category, matched_keywords: frozenset)`
- `_adjust_severity()` → `(severity, escalation_keywords: frozenset)`
- `_explain()` → human string
- Returns dataclass: `category`, `adjusted_severity`, `risk_score`, `recommendations`, `explanation`, `explanation_meta`
- No I/O — designed to be swapped for an LLM call without touching routes or service

### Audit Pattern
`AUDITED_FIELDS = {"treatment_type", "days_away", "restricted_days", "recordable"}`  
Snapshot-then-diff: before applying PATCH, snapshot current values → compute diff → write only changed fields to `IncidentAuditLog`. Initial creation writes a baseline audit entry for all audited fields.

### OSHA Compliance Forms
- **Form 301** — per-incident detail report
- **Form 300** — annual log of all recordable incidents by center and year (via `OshaLog` table)
- **Form 300A** — annual summary aggregated from Form 300
- `OSHARetentionRecord` — tracks 29 CFR 1904.33 five-year retention obligations
- `OSHAPosting` — tracks annual Feb 1 – Apr 30 Form 300A posting, with immutable snapshot

---

## Case Management (`modules/cases/`)

Each incident can have one or more `IncidentCase` rows. Cases are the investigation and resolution workflow layer.

```
IncidentCase: incident_id, tenant_id, organization_id (denormalized for scope queries),
              assigned_to_user_id, assigned_role, status, priority, escalation_level, due_date

IncidentTask: case_id, tenant_id, title, assigned_to_user_id, completed, due_date

IncidentComment: case_id, tenant_id, user_id, message, visibility (all|hr_only|legal_only|management_only)

CaseTimeline: append-only event log (case_created, status_changed, assigned, comment_added,
              task_created, task_completed, escalated, priority_changed, closed)
```

**Case statuses:** `new → assigned → investigating → awaiting_followup → resolved → closed`  
**Priorities:** `low | medium | high | critical`  
**Escalation levels:** integer (0 = none; ≥1 = escalated; ≥2 = surfaced in mobile alerts; ≥3 = critical in UI)

---

## Evidence Module (`modules/evidence/`)

```
EvidenceFile: case_id, tenant_id, file_name, mime_type, file_path (local upload), category,
              visibility, uploaded_by_user_id, ai_summary, ai_tags (JSONB), ai_risk_signals (JSONB)

EvidenceNote: evidence_file_id, extracted_text, ai_summary (text-based analysis result)
```

**`analysis.py`** — rule-based evidence intelligence (pure functions):
- `extract_text(content, mime_type)` — PDF text extraction via pdfminer; plain text passthrough
- `analyze(file_name, category, mime_type, extracted_text)` → `{ai_summary, ai_tags, ai_risk_signals}`
- Category signals: per-category risk signal list (witness statements, injury photos, OSHA forms, legal docs, etc.)
- Keyword signals: regex-tokenized text matched against legal, OSHA, injury, HR violation, remediation keyword sets
- Risk signals sorted by severity: `critical → high → medium → low`

Upload storage: local filesystem at `settings.upload_dir` (`/tmp/packguardian_uploads` by default; override via env)

---

## Inspections Module (`modules/inspections/`)

```
Inspection: tenant_id, center_code, qr_code_id (optional), created_by_user_id, case_id (created on failure),
            title, inspection_type, status, score (0-100), notes, completed_at

InspectionItem: inspection_id, tenant_id, sort_order, label, severity, result, notes, evidence_file_id
```

**Inspection types:** `general | kennel | safety | sanitation | equipment`  
**Statuses:** `in_progress | completed | passed | failed`  
**Item results:** `pending | pass | fail | na`

Scoring: starts at 100, deducts `critical=25`, `major=15`, `minor=5` per failed item.  
Templates: pre-populated checklists per inspection type (defined in `INSPECTION_TEMPLATES`).  
A failed inspection automatically creates an `IncidentCase` for corrective action tracking.

---

## Safety Module (`modules/safety/`)

OSHA record retention and posting compliance:
- `OSHARetentionRecord` — one row per incident+form type; tracks 5-year retention per 29 CFR 1904.33
- `OSHAPosting` — annual Form 300A posting log with immutable snapshot of form data at posting time

---

## Automation Module (`modules/automation/`)

```
AutomationEvent: tenant_id, event_type, severity, payload (JSONB), processed_at

WorkflowConfig: tenant_id, event_type (* = all), workflow_name, webhook_url, is_enabled

WorkflowDelivery: event_id, workflow_config_id, status (success|failure|pending),
                  response_code, response_body, attempted_at
```

Events are triggered by safety actions (incident created, case escalated, etc.) and fanned out to registered webhook URLs. The automation page (`/automation`) shows events and delivery status.

---

## Realtime Engine (`modules/ws/`)

### Architecture
- `ConnectionManager` — in-process singleton with `channels: dict[str, set[WebSocket]]`
- Two channel types:
  - `tenant:{tenant_id}` — all authenticated users in a tenant
  - `user:{user_id}` — single-user notifications
- `broadcast_sync(channel, payload)` — callable from synchronous FastAPI thread-pool handlers via `asyncio.run_coroutine_threadsafe()` against the event loop captured at startup

### Events (`ws/events.py`)
All broadcasts are minimal `{type, ...ids, ts}` payloads — client re-fetches on receipt:
- `INCIDENT_CREATED`, `CASE_ASSIGNED`, `CASE_ESCALATED`, `CASE_STATUS_CHANGED`
- `TASK_COMPLETED`, `TASK_REOPENED`, `COMMENT_ADDED`
- `EVIDENCE_UPLOADED`, `EVIDENCE_ANALYZED`
- `AUTOMATION_TRIGGERED`
- `NOTIFICATION_CREATED` (user-channel only)

---

## Hub Module (`modules/hub/`)

No models — aggregated query layer over existing tables. Three routers:

| Router | Prefix | Purpose |
|---|---|---|
| `router_work` | `/my-work` | Personal work queue: assigned cases, overdue tasks, escalations, pending OSHA review, counts |
| `router_command` | `/command` | Command center: risk metrics, case status distribution, escalations, automation events, audit activity |
| `router_search` | `/search` | Universal search across incidents, cases, centers, evidence (tenant+org-scoped) |

All endpoints apply `OrgScope` for role-appropriate result filtering.

---

## Mobile Module (`modules/mobile/`)

Mobile-optimised aggregated endpoint: `GET /mobile/my-shift`  
Returns a flat `MyShiftResponse`:
- Counts: assigned cases, overdue tasks, active incidents, pending inspections, unread notifications
- Urgent cases (top 5, sorted by priority + escalation)
- My tasks (top 5, soonest due)
- Alerts: escalation alerts (level ≥2), overdue task summary

The mobile frontend (`/mobile`) uses this single endpoint to populate the entire shift view.

---

## Workspace Module (`modules/workspace/`)

`GET /workspace/profile` — resolves the authenticated user's full role context in a single call:

Returns `WorkspaceProfile`:
- `primary_role` — machine key derived from user's system role + org memberships, using priority order
- `role_context` — display label (uses tenant terminology overrides)
- `org_roles` — list of org-level roles
- `is_admin` — bool
- `terminology` — merged DEFAULT_TERMINOLOGY + tenant overrides
- `nav` — visibility flags for all nav sections (role-gated)
- `quick_actions` — role-specific action shortcuts (4-6 per role)
- `dashboard_title`, `dashboard_subtitle` — copy for empty state / header

`PATCH /workspace/terminology` — admin only; updates `TenantSettings.terminology` JSONB

---

## Map Module (`modules/map/`)

```
Center: tenant_id, center_code (matches Incident.center_id), name, latitude, longitude,
        address, city, state
```

`map/heat.py` — aggregate incident counts per center for heatmap rendering.  
Frontend `RiskMap.tsx` renders center risk intensity as a geographic overlay.

---

## QR Module (`modules/qr/`)

```
QRCode: tenant_id, code (PG-XXXXXX, unique), target_type, target_name, center_code,
        target_metadata (JSONB), created_by_user_id
```

QR codes link physical locations (rooms, kennels, equipment zones) to the digital inspection workflow. Scanning a code on the mobile interface pre-fills the inspection form with the linked center and room context. `Inspection.qr_code_id` links back to the triggering QR code.

---

## Notifications Module (`modules/notifications/`)

```
Notification: tenant_id, user_id, notification_type, title, message,
              resource_type, resource_id, is_read
```

Types: `case_assigned | task_assigned | escalated | overdue | mention | case_updated`  
The `NotificationBell` component polls for unread count and displays inline.  
New notifications are also pushed in realtime via the `user:{user_id}` WebSocket channel.

---

## Integrations Module (`modules/integrations/`)

Cross-app integration layer — push only, PackGuardian never pulls from ecosystem apps.

```
IntegrationRef: tenant_id, app_name (aegis_ai|dp_dvm_map|custom), resource_type,
                resource_id, external_id, external_url

IntegrationWebhook: tenant_id, app_name, webhook_url, event_filter (comma-sep or *), is_active
```

`IntegrationRef` stores the fact that a PackGuardian incident/case/inspection is also tracked in an external system. Governance logic stays in the external system.

---

## Provision Module (`modules/provision/`)

Handles tenant onboarding lifecycle:
- `TenantSettings` — extended per-tenant config (see Tenant System above)
- `TenantInvitation` — single-use invite tokens (7-day expiry), pre-assignable to org node
- `provisioner.py` — org tree setup, settings initialisation for new tenants
- `demo.py` — demo data seeding for trial tenants

---

## Frontend Architecture

### Provider Stack (layout.tsx)
```
TenantProvider
  └── AuthProvider
        └── WorkspaceProvider
              └── AppHeader
              └── <main>{children}</main>
```

### Context Contracts

| Context | What it provides |
|---|---|
| `TenantContext` | Branding config (name, logo_url, primary_color, secondary_color, theme). Fetches `GET /tenant` — **no auth required**. Applies `--brand-primary`, `--brand-secondary` CSS vars and `dark` class. Falls back silently on failure. |
| `AuthContext` | `isAuthenticated`, `token`, `user`, `login()`, `logout()`. Stores JWT in `localStorage`. Attaches `Authorization: Bearer` header to all API calls. Redirects to `/login` on 401. |
| `WorkspaceContext` | `profile` (full `WorkspaceProfile`), `loading`. Fetches `GET /workspace/profile` after auth. |

### Role-Contextual Dashboard (page.tsx)
Lazy-loads one of six role views based on `profile.primary_role`:
- `AdminManagerView` — full admin/manager/operations dashboard
- `SafetyView` — safety intelligence, OSHA queue, inspection results
- `HRView` — employee injury queue, recordable incident list
- `CenterManagerView` — center-scoped incidents, today's tasks
- `DistrictManagerView` — multi-center risk overview
- `FieldStaffView` — simplified shift view

### Frontend Routes
| Route | Purpose |
|---|---|
| `/login` | Auth page — public, fetches branding via TenantContext |
| `/` | Role-contextual dashboard |
| `/cases` | Case management |
| `/osha` | OSHA 300/301/300A reporting |
| `/safety` | Safety intelligence dashboard |
| `/command` | Command center (admin/ops) |
| `/map` | Geographic risk map |
| `/work` | My work queue |
| `/organizations` | Org hierarchy management |
| `/automation` | Automation events and workflow configs |
| `/mobile` | Mobile shift dashboard |
| `/mobile/incident` | Quick incident report (mobile) |
| `/mobile/inspect` | QR-triggered inspection (mobile) |
| `/settings` | Tenant settings, user management |
| `/onboard` | Onboarding flow |
| `/welcome` | Post-onboard welcome |
| `/join` | Accept invitation token |

---

## Start / Stop Conventions

### `start.sh`

Three-stage startup with dependency gating — a failed stage blocks later stages:

**STAGE 1 — API**
1. Enforce `api/.env` exists
2. Check dependencies: `python3`, `node`, `npm`, `curl`, `cloudflared`
3. Validate named Cloudflare tunnel `packguardian` exists
4. Kill existing processes on ports 8100 and 3000
5. Create `api/.venv` if absent; install requirements
6. Start `uvicorn` on port 8100 (logs → `.logs/api.log`)
7. Health check `GET http://localhost:8100/health` with retry loop

**STAGE 2 — WEB** (only runs if API health check passes)
1. `npm install` in `web/`
2. Start `next dev` on port 3000 (logs → `.logs/web.log`)
3. Health check `GET http://localhost:3000` with retry loop

**STAGE 3 — TUNNEL** (only runs if web health check passes)
1. Run `cloudflared tunnel run packguardian` (logs → `.logs/tunnel.log`)

**Logging convention:**  
`[packguardian]`, `[packguardian][api]`, `[packguardian][web]`, `[packguardian][tunnel]`

### `stop.sh`
Kills processes on ports 8100 and 3000, kills `cloudflared tunnel run packguardian`.

---

## Cloudflare Assumptions

- A named tunnel `packguardian` must exist before `start.sh` runs
- `cloudflared tunnel list` must return a row matching `packguardian`
- Tunnel config (routing to localhost:3000) is managed externally
- `start.sh` does not create tunnels — it validates and runs an existing one

---

## Database Assumptions

- PostgreSQL only (JSONB, UUID types used throughout)
- Dev mode (`ENV=dev`): `main.py` auto-creates the database if unreachable
- Prod mode: unreachable DB → `logger.critical` + `sys.exit(1)`
- Schema management: `Base.metadata.create_all(bind=engine)` at startup + idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration functions for one-time column additions
- No Alembic yet — each schema change gets a named `_migrate_*()` function in `main.py`
- Connection string: `DATABASE_URL` env var; defaults to `postgresql+psycopg2://user:password@localhost:5432/packguardian`

---

## Environment Variables (api/.env)

| Variable | Purpose |
|---|---|
| `ENV` | `dev` or `prod` (controls DB auto-create and log verbosity) |
| `DATABASE_URL` | Full psycopg2 connection string |
| `JWT_SECRET` | HS256 signing secret — MUST be changed in production |
| `JWT_ALGORITHM` | Default `HS256` |
| `JWT_EXPIRE_HOURS` | Default `24` |
| `LOG_FILE` | Set by `start.sh` to `.logs/api.log` |
| `UPLOAD_DIR` | File upload directory; default `/tmp/packguardian_uploads` |
| `CORS_ORIGINS` | Comma-sep list; defaults include localhost:3000 and packguardian domain |

---

## Deployment Standards

- API runs on port **8100**
- Frontend runs on port **3000**
- Cloudflare Tunnel routes public traffic → localhost:3000 (web)
- API is not directly public — frontend proxies or CORS allows it from the same origin
- Logs in `.logs/` at project root (gitignored)
- `.venv` is in `api/.venv` — never use system pip
- No Docker at this time — bare process management via `start.sh` / `stop.sh`

---

## AI Agent Framework — Planned

Not yet built. Intended direction:

The intelligence engines (`osha/intelligence.py`, `evidence/analysis.py`) are deliberately pure functions with no I/O. This is the seam where LLM calls slot in — replace the rule-based body with a Claude API call, keeping the same function signature and return type. No route or service changes required.

Planned capabilities:
- LLM-backed incident classification and severity adjustment
- Evidence document summarisation beyond keyword matching
- Natural language corrective action recommendations
- Proactive safety pattern narration (currently rule-based in `analytics.py`)

**Not planned for PackGuardian:** autonomous agent governance, policy lifecycle management, or AI audit trails — those belong in Aegis AI.

---

## Placeholder Modules

These directories exist but are empty or minimal — reserved for future development:

| Module | Intended purpose |
|---|---|
| `animal_safety` | Animal welfare incident tracking (bites, illness, death) separate from worker injuries |
| `fire` | Fire safety inspection and drill tracking |
| `training` | Staff safety training record management |
