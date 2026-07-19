# PackGuardian — Production Readiness Report
*Brutally honest scoring across 16 dimensions*
*Generated: 2026-05-20*

---

## Scoring Key

| Score | Meaning |
|-------|---------|
| 9–10 | Production-ready. Ship it. |
| 7–8 | Ready with minor gaps. Acceptable for pilot. |
| 5–6 | Functional but fragile. Acceptable for demo only. |
| 3–4 | Known failure modes. Should not face real operators. |
| 1–2 | Broken or missing. Blocks pilot. |

---

## Dimension Scores

### 1. Frontend Stability — 7/10

**Current state:** All 13 routes return 200. Next.js production build succeeds cleanly. Suspense wrappers are correct on all `useSearchParams()` callsites. WebSocket reconnection works with exponential backoff. The 401 interceptor redirects gracefully. No hydration mismatches observed.

**Remaining gaps:**
- AppHeader desktop nav visible on mobile viewport — functionally harmless but visually confusing
- Voice recognition only available on Chrome/Android (not iOS Safari) — no visible warning to the user when unsupported
- No error boundary around tab content in case detail — a JS error in the AI Copilot tab crashes the entire panel

**Exact fixes needed:**
- Add `if (!window.SpeechRecognition && !window.webkitSpeechRecognition)` check and show "Voice input not available on this browser" message instead of the record button
- Wrap tab content panels in a simple ErrorBoundary component

**Estimated effort:** 2 hours

---

### 2. Mobile Usability — 7/10

**Current state:** Mobile layout padding issue fixed (no longer wrapped in desktop `px-6 py-8`). Bottom nav works. Voice input works. Center code pre-fills. Photo upload now actually posts. Suspense wrapper fixed on inspect page. Status badges fixed.

**Remaining gaps:**
- AppHeader renders full desktop nav on mobile routes — horizontal scroll of nav items on small screen
- Inspect page doesn't persist center code in localStorage (inconsistency with incident form)
- No "you'll lose progress" warning if user navigates away mid-incident form
- Mobile success screen doesn't link to the created case — operator can't immediately verify

**Exact fixes needed:**
- Hide AppHeader nav items on /mobile routes (show only logo + auth)
- Add localStorage persistence for center code in inspect form
- Add success screen link: "View your report →" pointing to `/cases?incident_id={id}`

**Estimated effort:** 3 hours

---

### 3. API Stability — 8/10

**Current state:** 25+ FastAPI routers registered. All health checks pass. DB connection validated at startup. `create_all()` is idempotent. 6 idempotent migration functions run at startup. Pydantic v2 validation on all routes. 401/403/422/500 handled consistently. SQLAlchemy 2.0 session-per-request pattern.

**Remaining gaps:**
- No rate limiting on `POST /auth/login` — brute force possible
- `get_current_user` does not check `user.is_active` — deactivated accounts can still authenticate
- `refresh_signals()` does non-transactional delete+insert — signal loss if insert fails mid-way
- Diagnostics shows `active_signals: -1` (query bug — count returns -1 instead of actual count)
- CORS only allows `localhost:3000` and the tunnel URL; `localhost:3005` is excluded — local testing broken unless using the tunnel

**Exact fixes needed:**
- Add `if not user.is_active: raise 401` in `get_current_user`
- Add `localhost:3005` to `cors_origins` list in config.py (or .env)
- Fix `active_signals` count in diagnostics route (likely needs scalar vs. count fix)
- Wrap signal refresh in a single DB transaction

**Estimated effort:** 3 hours

---

### 4. Upload Reliability — 4/10

**Current state:** Upload endpoint exists and works. Files go to `/tmp/packguardian_uploads/{tenant_id}/{case_id}/`. Directory is created on demand. AI analysis runs synchronously after upload. Mobile incident upload now correctly posts to the case evidence endpoint after finding the case.

**Remaining gaps:**
- `/tmp` is cleared on system reboot — photos are permanently lost after any reboot
- No S3/R2/cloud storage configured — this is the single biggest trust-destroying gap
- If the API restarts (not reboots), `/tmp` files survive — but this gives false confidence
- Upload directory (`/tmp/packguardian_uploads`) doesn't exist yet until first upload — the `mkdir(parents=True)` handles this, but a cold API with no uploads shows an empty evidence tab even for existing cases
- No file size limit enforcement in the mobile form UI (backend enforces MAX_FILE_BYTES, but user gets no preemptive warning)
- Mobile photo upload race condition: case lookup happens after incident creation; if the auto-case-creation is slow, the case query returns empty and photos are silently skipped

**Exact fixes needed:**
- Configure `UPLOAD_DIR` to a persistent path (e.g. `/home/jesse/infra/apps/packguardian/uploads/`)
- OR configure S3/Cloudflare R2 with the existing `upload_dir` as a fallback
- Add a 500ms delay before case lookup in mobile incident form (mitigates race condition)
- Show photo file size warning in mobile form if file > 10MB before attempting upload

**Estimated effort:** 4 hours (persistent local dir: 30 min; cloud storage: 1–2 days)

---

### 5. OSHA Workflow Integrity — 8/10

**Current state:** Recordability is rule-based and explainable. Form 300 log is accurate. Form 300A annual summary computes correctly. Form 301 per-incident detail works. Finalization creates a locked, timestamped record. Before/after values captured in audit log. OSHA fragment key bug fixed. Client-side OSHA flag preview works during intake.

**Remaining gaps:**
- No Form 300A export as a printable PDF — operators must post a physical form by Feb 1; they can't print from the current UI
- "OSHA Auto-Determined" label not visible in UI — when the system marks an incident recordable, there's no explanation of which rule triggered it
- No finalization confirmation modal — accidental finalize is permanent with no undo
- Recordability logic doesn't handle "medical removal" case (a specific OSHA criterion)

**Exact fixes needed:**
- Add "Determined by: [treatment_type=medical]" tooltip/label next to the OSHA Recordable badge
- Add finalization confirmation dialog: "Type FINALIZE to confirm" (one-time effort, ~2 hours)

**Estimated effort:** 3 hours

---

### 6. Audit Defensibility — 7/10

**Current state:** `IncidentAuditLog` tracks all changes with actor, timestamp, action, resource. Before/after values captured for OSHA field changes. Finalized records are locked. `CaseTimeline` is append-only. `is_finalized` + `finalized_at` + `finalized_by` populated.

**Remaining gaps:**
- Audit log does not capture who viewed a record (read access isn't logged)
- No audit log for evidence deletion (the delete function logs to audit but may not be consistent)
- Audit log timestamps are UTC but display in the UI without timezone indicator — could cause confusion in multi-timezone audits
- No way to export the audit log as a PDF or CSV for legal counsel

**Exact fixes needed:**
- Add "UTC" label to all timestamp displays in the OSHA and case detail views
- Verify evidence delete audit log is written before the delete (currently: `db.delete(ef); db.commit()` — audit log is written before delete, which is correct)

**Estimated effort:** 1 hour

---

### 7. Multi-Tenant Readiness — 8/10

**Current state:** Every table has `tenant_id UUID NOT NULL`. All queries filter by `tenant_id`. `get_current_user` returns the authenticated user's `tenant_id` which propagates through the DI chain. Organization scope is layered on top. No cross-tenant data leak observed.

**Remaining gaps:**
- Currently one tenant in the DB — the isolation logic is untested with multiple real tenants
- `POST /provision/reset-demo` nukes ALL data for the authenticated user's tenant — correct behavior, but no guard against using it on a non-demo tenant
- Demo data uses `DEFAULT_TENANT_ID` — if a real tenant was provisioned, their tenant_id differs, and the demo reset would correctly target only them. But the risk of accidental use remains.

**Exact fixes needed:**
- Add `DEMO_TENANT_ID` env var; `reset-demo` only runs if `current_user.tenant_id == DEMO_TENANT_ID`
- Log a warning if reset is called on a non-demo tenant and return 403

**Estimated effort:** 1 hour

---

### 8. Executive Usability — 7/10

**Current state:** Executive Briefing page loads with KPI row, trend indicator, risk distribution, top incident types, top locations, OSHA status, center health panel. Subtitle now says "Safety performance across all locations." Escalation language uses Review Stage terminology.

**Remaining gaps:**
- Metric cards are not clickable — "4 open cases" should link to `/cases?status=open`
- No "This week's summary" narrative at the top — executives want 2 sentences before the numbers
- The Risk Distribution bar chart has no legend explanation ("What is an elevated risk incident?")
- The page reloads all data on every visit — no caching, slow on poor connections

**Exact fixes needed:**
- Make KPI cards into `<Link>` components pointing to filtered views
- Add a 2-sentence narrative: "This week: N incidents (↑/↓ vs last week). Your highest-risk location is X with Y incidents."

**Estimated effort:** 2 hours

---

### 9. Field Usability — 7/10

**Current state:** Voice intake works under noise. Center code pre-fills. Photo upload confirmed. Quality hint for short descriptions. Offline queue captures reports without network. Success screen sets expectations. Back navigation works throughout.

**Remaining gaps:**
- No "add to home screen" prompt or PWA manifest — operators must bookmark manually
- Voice not available on iOS Safari (20–30% of phones in kennel environments)
- Inspection form doesn't carry center code from localStorage
- The incident type grid has 12 items — "Aggressive Behavior" and "Dog Fight" look similar and are adjacent
- No way to view or correct a submitted report from the success screen

**Exact fixes needed:**
- Add `<meta name="apple-mobile-web-app-capable">` + manifest.json for PWA installability
- Move "Dog Fight" and "Aggressive Behavior" apart in the grid (or make "Dog Fight" visually distinctive)
- Add a "View your report" link on the success screen linking to the created case

**Estimated effort:** 3 hours

---

### 10. Deployment Reliability — 6/10

**Current state:** `start.sh` kills existing processes, installs deps, health-checks the API before starting the web, logs everything. `stop.sh` kills by port. `status.sh` checks processes, health, DB, env, logs. Cloudflare tunnel handles HTTPS termination.

**Remaining gaps:**
- `start.sh` runs `npm run build` (3–5 minutes) on every start — a slow deployment path
- No systemd service — processes don't restart on server reboot or crash
- No `restart.sh` — only full stop+start cycle available
- The web starts without a health check — `start.sh` doesn't verify web is actually serving before printing "System Started"
- No rollback capability — if the build succeeds but runtime fails, no previous build is kept

**Exact fixes needed:**
- Create `restart-api.sh` that only restarts uvicorn (skips npm build) — for API-only changes
- Add web health check loop in `start.sh` (after web start, poll `localhost:3005` for up to 30 seconds)
- Create a `restart.sh` shortcut combining stop + start

**Estimated effort:** 2 hours

---

### 11. Logging / Observability — 6/10

**Current state:** API logs to stdout + `$LOGS/api.log`. Log format includes timestamp, level, logger name, message. `status.sh` shows last 3 lines of each log. `/provision/diagnostics` endpoint shows system state. `/command/pilot-metrics` shows adoption analytics.

**Remaining gaps:**
- No structured JSON logging — grepping for errors requires text pattern matching
- No log rotation — `api.log` grows indefinitely (could fill disk over weeks)
- No alerting — no notification when the API crashes or errors spike
- Web server errors go to `$LOGS/web.log` but Next.js error format is different — hard to parse
- No request-level correlation ID — can't trace a specific user's report through the system

**Exact fixes needed:**
- Add `logrotate` config: rotate `api.log` daily, keep 7 days
- This is a 30-minute infrastructure task, not a code change

**Estimated effort:** 1 hour

---

### 12. Error Recovery — 6/10

**Current state:** `get_current_user` raises clean 401. Axios 401 interceptor redirects to login. Offline queue captures mobile submissions when API is down. WebSocket reconnects with exponential backoff. `_validate_db()` at startup exits if DB unreachable.

**Remaining gaps:**
- If the API crashes mid-session, the frontend shows blank pages or silent failures — no "API appears to be down, try refreshing" state
- Upload failures are silent (mobile form shows success even if evidence upload fails — by design, but operators don't know photos didn't save)
- If `create_all()` fails at startup (e.g., DB schema conflict), the process crashes with a stack trace — no clean error message
- No circuit breaker on signal refresh — if signal detection crashes, the incident creation still succeeds but no error is shown

**Exact fixes needed:**
- The header "Connection issue" dot already handles API-down detection. The issue is when it goes from OK → down mid-session; adding a banner ("API temporarily unavailable — your work is saved") would help.

**Estimated effort:** 2 hours

---

### 13. Security Posture — 5/10

**Current state:** JWT-based auth (HS256, 24h expiry). bcrypt password hashing. Tenant isolation on all queries. CORS configured. HTTPS via Cloudflare. File access requires valid JWT. Multipart upload validates MIME type and file size.

**Remaining gaps (ordered by severity):**

1. **Default admin credentials active** — `admin@packguardian.com` / `changeme` is a live account that anyone can use if they reach the login page. CRITICAL.
2. **No `is_active` check in auth** — disabled users can still log in
3. **No rate limiting on `/auth/login`** — unlimited login attempts possible
4. **JWT secret has an unsafe default** — if `.env` is absent, the code falls back to "CHANGE-THIS-SECRET-IN-PRODUCTION"
5. **CORS missing `localhost:3005`** — local dev testing against local API will fail
6. **No password reset mechanism** — if an operator forgets their password, Jesse must manually update it in the DB
7. **Upload path traversal** — file names are sanitized via `Path(file.filename).name` (safe), but MIME type validation only checks `content_type` (client-provided, can be spoofed)
8. **Evidence files served without streaming** — large files (up to 100MB) are read entirely into memory for download

**Exact fixes needed:**
- Change the default admin password **immediately**
- Add `if not user.is_active: raise 401` to `get_current_user`
- Add `localhost:3005` to CORS_ORIGINS in `.env`

**Estimated effort:** 2 hours for auth hardening; rate limiting requires a dependency (slowapi) — 4 hours

---

### 14. Documentation Quality — 6/10

**Current state:** `RELAUNCH_STATUS.md`, `LIVE_TEST_AUDIT.md`, `LIVE_TEST_LOG.md`, `SUPPORTABILITY_GUIDE.md`, `DEPLOYMENT_RUNBOOK.md`, `CRITICAL_PILOT_BLOCKERS.md`, `TRUST_GAP_REPORT.md` exist. API has Swagger at `/docs`.

**Remaining gaps:**
- No `README.md` at project root covering setup from scratch for a new machine
- No `.env.example` for the API (`.env` is present but not a template)
- `web/.env.local.example` exists — good
- No "how to add a new user" operator guide
- No "how to create a QR code" guide for admins
- Onboarding wizard has no help text explaining org structure concepts
- The demo reset endpoint is documented in `status.sh` output but no warnings about using it on production

**Exact fixes needed:** See JESSE_REQUIRED_INPUTS.md for what documentation decisions need Jesse's input.

**Estimated effort:** 4 hours for a complete operator guide + README

---

### 15. Pilot Readiness — 6/10

**Current state:** The platform is functionally complete for a pilot. Incident intake, case management, OSHA tracking, corrective actions, safety signals, executive reporting, and mobile intake all work end-to-end. Demo data is seeded. Relaunch is validated.

**What's missing for a real pilot:**
- File storage persistence (C1 blocker — photos lost on reboot)
- Default admin password change (security blocker)
- Demo reset locked to demo tenant (ops safety blocker)
- No email notifications — supervisors are "notified" in the success screen copy, but no actual email is sent
- QR labels aren't printable from the UI — admin must generate manually
- No user-facing password reset

**Pilot readiness verdict:** Demo-ready. Pilot-possible with 3 specific fixes (file storage, password change, tenant lock). Not production-safe without all security hardening.

---

### 16. Overall Production Readiness — 6/10

**Honest verdict:** PackGuardian is a credible, functional operational platform. The core workflows work. The data model is sound. The audit trail is real. Multi-tenant isolation is correct.

**What prevents production readiness today:**
1. Default admin password is "changeme" — anyone can log in
2. File uploads are lost on reboot — photos disappear
3. No email notification system — "supervisor notified" is false advertising
4. Demo reset can wipe production data

**What can wait until post-pilot:**
- Rate limiting
- Cloud file storage (local persistent path is acceptable for pilot)
- PDF export
- Password reset flow
- Systemd service

---

## Summary Table

| Dimension | Score | Pilot OK? | Prod OK? |
|-----------|-------|-----------|----------|
| Frontend stability | 7 | ✓ | With fixes |
| Mobile usability | 7 | ✓ | With fixes |
| API stability | 8 | ✓ | With fixes |
| Upload reliability | 4 | ✗ | ✗ |
| OSHA workflow integrity | 8 | ✓ | ✓ |
| Audit defensibility | 7 | ✓ | ✓ |
| Multi-tenant readiness | 8 | ✓ | With fixes |
| Executive usability | 7 | ✓ | With fixes |
| Field usability | 7 | ✓ | With fixes |
| Deployment reliability | 6 | ✓ | With fixes |
| Logging/observability | 6 | ✓ | With fixes |
| Error recovery | 6 | ✓ | With fixes |
| Security posture | 5 | ✗ | ✗ |
| Documentation quality | 6 | With gaps | ✗ |
| Pilot readiness | 6 | With fixes | — |
| **Overall** | **6** | **With 3 fixes** | **Not yet** |

**The 3 fixes that unlock pilot:**
1. Change default admin password
2. Move upload dir to persistent path
3. Lock demo reset to demo tenant

*PackGuardian — Production Readiness Report*
