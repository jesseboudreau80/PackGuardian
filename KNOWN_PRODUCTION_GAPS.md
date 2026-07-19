# PackGuardian — Known Production Gaps
*Consolidated issue registry — all known issues in one place*
*Generated: 2026-05-20*

---

## Critical Before Pilot

### GAP-C1 — Default admin password is "changeme"
- **Root cause:** `_seed_default_admin()` in `main.py` seeds `admin@packguardian.com` / `changeme` if no users exist. This user was never deleted.
- **Operational impact:** Anyone who reaches the login URL can authenticate with full admin access. During a demo, this is a live risk.
- **Likelihood:** HIGH — the URL is public via Cloudflare tunnel
- **Recommended fix:** Change the password via the settings UI, or directly: `POST /auth/login` with the new password, then update via `PATCH /users/{id}`
- **Complexity:** 5 minutes

### GAP-C2 — File uploads lost on server reboot
- **Root cause:** `UPLOAD_DIR=/tmp/packguardian_uploads` — `/tmp` is cleared on reboot. The directory doesn't even exist yet (no uploads have been made since last restart).
- **Operational impact:** Any evidence photo uploaded during a pilot is permanently lost on next server reboot. Operators who upload injury photos to support OSHA claims lose that evidence.
- **Likelihood:** CERTAIN — any server maintenance causes data loss
- **Recommended fix:** Change `UPLOAD_DIR` in `.env` to a persistent path: `/home/jesse/infra/apps/packguardian/uploads` and create the directory.
- **Complexity:** 10 minutes

### GAP-C3 — Demo reset has no tenant guard
- **Root cause:** `POST /provision/reset-demo` runs against the authenticated user's tenant with no validation that it's the demo tenant.
- **Operational impact:** If a pilot operator is accidentally given admin access and somehow finds/calls this endpoint, all their data is wiped.
- **Likelihood:** LOW for current setup (demo is only tenant) but HIGH risk when real tenants exist
- **Recommended fix:** Add `DEMO_TENANT_ID` env var; reset endpoint returns 403 if `current_user.tenant_id != DEMO_TENANT_ID`
- **Complexity:** 30 minutes

### GAP-C4 — No email/SMTP notification system
- **Root cause:** "Your supervisor has been notified" appears on the mobile success screen, but no email is sent. There is no SMTP configuration anywhere.
- **Operational impact:** Supervisors don't actually receive notifications when incidents are filed. The platform's core value proposition (incident routing) doesn't work without this.
- **Likelihood:** Operators will discover this immediately during their first real incident
- **Recommended fix:** Integrate a transactional email service (SendGrid free tier, Resend, or Mailgun). Add `POST /incidents` trigger → email to all admin users.
- **Complexity:** 4–8 hours

---

## High Priority

### GAP-H1 — `get_current_user` doesn't check `is_active`
- **Root cause:** `auth/dependencies.py` queries for the user but doesn't check `user.is_active`. The `is_active` column was added via migration but is never consulted.
- **Operational impact:** A deactivated user (e.g., a departed employee) can still log in with their old credentials.
- **Recommended fix:** Add `if not user.is_active: raise credentials_error` after the user query
- **Complexity:** 5 minutes

### GAP-H2 — No rate limiting on `POST /auth/login`
- **Root cause:** No rate limiting middleware configured. FastAPI has no built-in rate limiting.
- **Operational impact:** Unlimited brute-force attempts against any known email address.
- **Recommended fix:** Add `slowapi` dependency and apply `@limiter.limit("5/minute")` to the login route
- **Complexity:** 1 hour

### GAP-H3 — CORS excludes `localhost:3005` (local dev broken)
- **Root cause:** `cors_origins` in `config.py` lists only `localhost:3000` and the tunnel URL. The web server runs on port 3005.
- **Operational impact:** Local development testing with the web at localhost:3005 hitting the API at localhost:8105 will fail with CORS errors. In production this doesn't matter (tunnel URL is whitelisted), but for dev iteration it's friction.
- **Recommended fix:** Add `http://localhost:3005` to `CORS_ORIGINS` in `api/.env`
- **Complexity:** 1 minute

### GAP-H4 — No finalization confirmation UI
- **Root cause:** The finalize button in the OSHA tab does not require confirmation. One accidental tap permanently locks the record.
- **Operational impact:** An operator who finalizes the wrong incident must call Jesse to reverse it via direct DB update.
- **Recommended fix:** Add a confirmation dialog requiring the user to type "FINALIZE" or click a secondary confirm button
- **Complexity:** 1 hour

### GAP-H5 — Diagnostics reports `active_signals: -1`
- **Root cause:** The diagnostics endpoint query for active signal count returns -1 instead of the real count (6 signals exist). Likely a scalar vs. count query bug.
- **Operational impact:** Support tool shows wrong data, reducing confidence in the diagnostics endpoint
- **Recommended fix:** Fix the count query in `provision/routes.py` diagnostics endpoint
- **Complexity:** 30 minutes

### GAP-H6 — No password reset for operators
- **Root cause:** No `/auth/reset-password` endpoint or email-based reset flow exists.
- **Operational impact:** If an operator forgets their password, they're locked out. Jesse must manually update the DB.
- **Recommended fix:** Add a "Forgot password?" link on login that sends a reset email (requires email system from GAP-C4)
- **Complexity:** 4 hours (after email system is implemented)

### GAP-H7 — Voice input unavailable on iOS Safari with no user warning
- **Root cause:** The `SpeechRecognition` API is only available on Chrome and some Android browsers. iOS Safari doesn't support it. The mobile form shows the mic button regardless.
- **Operational impact:** iOS users who tap the mic button and nothing happens will be confused. This affects ~30% of mobile users in most environments.
- **Recommended fix:** Check for API availability on mount; show "Voice input not available on this browser — use the text field below" instead of the mic button when unsupported
- **Complexity:** 30 minutes

### GAP-H8 — Upload photo race condition on mobile
- **Root cause:** After creating an incident, the mobile form queries `GET /cases?incident_id={id}` to find the case. If the auto-case-creation is slightly delayed (rare but possible under load), the query returns empty and photos are silently skipped.
- **Operational impact:** Evidence photos are lost without any error shown to the operator
- **Recommended fix:** Add a 500ms delay before the case lookup; retry once if empty
- **Complexity:** 15 minutes

---

## Medium Priority

### GAP-M1 — Onboarding org seeding is broken
- **Root cause:** `onboard/page.tsx` step 3 passes `parent_id: n.parent_index !== null ? undefined : undefined` — this is always `undefined`. Org hierarchy relationships set during onboarding are never actually saved.
- **Operational impact:** Org structure built during the onboarding wizard doesn't create proper parent-child relationships. Operators must rebuild org structure manually after onboarding.
- **Recommended fix:** Fix the parent_id logic: `parent_id: n.parent_index !== null ? seededOrgIds[n.parent_index] : undefined`
- **Complexity:** 1 hour

### GAP-M2 — Safety signal refresh is non-transactional
- **Root cause:** `refresh_signals()` in `detector.py` does `DELETE all active signals` then `INSERT new signals` with a `db.flush()` between them but within the same session. If the insert fails, the delete is rolled back — but `db.commit()` is called by the caller.
- **Operational impact:** On failure, all existing signals are lost and none are created. The system shows "No active signals" when there should be some.
- **Recommended fix:** Wrap in a single transaction; use `db.begin_nested()` for savepoint behavior
- **Complexity:** 1 hour

### GAP-M3 — `start.sh` runs full npm build on every start
- **Root cause:** `start.sh` always runs `npm run build` before starting the web server. This takes 3–5 minutes.
- **Operational impact:** API-only changes require a 5-minute restart cycle. Quick fixes become slow to deploy.
- **Recommended fix:** Add `restart-api.sh` that only restarts uvicorn without rebuilding the web
- **Complexity:** 30 minutes

### GAP-M4 — No systemd service (no auto-restart on crash/reboot)
- **Root cause:** Both services run as nohup background processes with `disown`. They won't restart on crash or server reboot.
- **Operational impact:** If the server reboots (OS updates, power cycle), the entire platform goes down and stays down until Jesse manually restarts it.
- **Recommended fix:** Create `/etc/systemd/system/packguardian-api.service` and `packguardian-web.service`
- **Complexity:** 2 hours

### GAP-M5 — No log rotation
- **Root cause:** API log appends indefinitely to `$LOGS/api.log`. On an active pilot with 100+ daily incidents, this grows ~1MB/day.
- **Operational impact:** After weeks/months, the log file fills the disk. `status.sh` becomes slow to read.
- **Recommended fix:** Add logrotate config at `/etc/logrotate.d/packguardian`
- **Complexity:** 30 minutes

### GAP-M6 — Mobile success screen doesn't link to the created case
- **Root cause:** The success screen shows "A case has been created" but the operator can't navigate to it. The incident_id is available after submission but not surfaced.
- **Operational impact:** Operators who want to immediately add more detail or verify the report must navigate to Cases and search manually.
- **Recommended fix:** Show "View your report →" link on the success screen after online submission
- **Complexity:** 1 hour

### GAP-M7 — No "add to home screen" / PWA support
- **Root cause:** No `manifest.json`, no service worker, no `apple-mobile-web-app-capable` meta tags.
- **Operational impact:** Operators must use a bookmark. Without a home screen icon, the app feels like a website, not a tool.
- **Recommended fix:** Add `web/public/manifest.json`, reference it in `layout.tsx`, add Apple meta tags
- **Complexity:** 2 hours

### GAP-M8 — Executive metric cards aren't clickable
- **Root cause:** The 4 KPI cards on the Executive Briefing page are static `<div>` elements.
- **Operational impact:** An exec who sees "4 escalated cases" has no way to drill into them without navigating separately to Cases.
- **Recommended fix:** Wrap KPI cards in `<Link>` components pointing to filtered views
- **Complexity:** 30 minutes

---

## Cosmetic / Polish Only

### GAP-P1 — OSHA Form 301 inline detail shows raw UUID as "Incident ID"
- Operators don't understand UUIDs. Show the case number or a truncated ID.

### GAP-P2 — Inspection "Finish" button is a small `text-xs` element in the header
- The primary action to complete an inspection is visually understated.

### GAP-P3 — Center Health trend arrows have no tooltip on hover
- "↑" could mean "improving" or "worsening" depending on the user's mental model. The `title` attribute exists but isn't visible on mobile.

### GAP-P4 — Mobile incident type grid: "Dog Fight" and "Aggressive Behavior" are adjacent
- These two types are visually similar and physically adjacent, causing misselection under stress.

### GAP-P5 — "Automation Events / System Events" panel on Command Center is confusing
- Operators don't understand what system events are or what "pending" means. Consider hiding this panel or collapsing it by default.

### GAP-P6 — QR scan page has no fallback when camera/image scan fails to find a code
- The error "No QR code found in image" appears, but there's no suggestion to try manual entry (which is right there on the page but not highlighted after a failure).

### GAP-P7 — Investigation Brief tab is sometimes slow (90-day window, Python-side matching)
- At 200+ incidents, the recurrence query scans the full 90-day table in Python. Not blocking for pilot, but noticeable.

---

*PackGuardian — Known Production Gaps*
*Track fixes in LIVE_TEST_LOG.md*
