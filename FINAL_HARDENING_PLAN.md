# PackGuardian — Final Hardening Plan
*The exact path from current state to pilot deployment*
*Generated: 2026-05-20*

---

## Current State Assessment

PackGuardian is a **functionally complete operational platform** with **specific, known gaps** that prevent pilot deployment. No features need to be added. This plan is about closing gaps, not expanding scope.

**Current score:** 6/10 overall production readiness
**Target score:** 8/10 (pilot-ready)
**Target score for production:** 9/10 (post-pilot)

---

## Phase 1 — Security Baseline (Do Today, ~2 hours)

These must be done before the URL is shared with anyone outside Jesse.

### 1A. Change the default admin password (5 minutes)

```bash
# Log in as the current admin and change the password via settings
# Or directly via API:
TOKEN=$(curl -sf -X POST https://packguardian-api.jesseboudreau.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@packguardian.com","password":"changeme"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Update via the tenant settings or user settings UI
# Then verify the old password no longer works
```

### 1B. Add JWT secret guard at startup (5 minutes)

In `api/main.py`, after imports:
```python
if settings.jwt_secret == "CHANGE-THIS-SECRET-IN-PRODUCTION":
    logger.critical("[packguardian] JWT_SECRET is the default. Set JWT_SECRET in api/.env")
    sys.exit(1)
```

### 1C. Add `is_active` check to auth (5 minutes)

In `api/app/modules/auth/dependencies.py`:
```python
user = db.query(User).filter(User.id == user_id).first()
if not user or not user.is_active:
    raise credentials_error
```

### 1D. Add `localhost:3005` to CORS (1 minute)

In `api/.env`:
```
CORS_ORIGINS=["http://localhost:3000","http://localhost:3005","https://packguardian.jesseboudreau.com"]
```

### 1E. Add API startup guard to API hardening (done inline with 1B)

After Phase 1, restart the API:
```bash
# Quick API restart (no web rebuild needed)
lsof -ti:8105 | xargs kill -9 2>/dev/null; sleep 1
cd /home/jesse/infra/apps/packguardian/api
nohup .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8105 --log-level info \
  >> /home/jesse/infra/apps/packguardian/.logs/api.log 2>&1 &
disown
```

---

## Phase 2 — Infrastructure Hardening (Do Today, ~1 hour)

### 2A. Fix upload directory persistence (10 minutes)

```bash
# Create persistent upload directory
mkdir -p /home/jesse/infra/apps/packguardian/uploads

# Update .env
sed -i 's|UPLOAD_DIR=.*|UPLOAD_DIR=/home/jesse/infra/apps/packguardian/uploads|' \
  /home/jesse/infra/apps/packguardian/api/.env

# Restart API (see 1E command above)
```

### 2B. Lock demo reset to demo tenant (30 minutes)

In `api/app/modules/provision/routes.py`, find `reset-demo`:
```python
@router.post("/reset-demo")
def reset_demo(db, current_user):
    import os
    demo_tenant_id = os.getenv("DEMO_TENANT_ID", "00000000-0000-0000-0000-000000000001")
    if str(current_user.tenant_id) != demo_tenant_id:
        raise HTTPException(403, "This endpoint is only available on the demo tenant")
    # ... rest of function
```

Add `DEMO_TENANT_ID=00000000-0000-0000-0000-000000000001` to `api/.env`.

### 2C. Add log rotation (30 minutes)

Create `/etc/logrotate.d/packguardian`:
```
/home/jesse/infra/apps/packguardian/.logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    copytruncate
}
```

---

## Phase 3 — API Fixes (Do This Week, ~4 hours)

### 3A. Fix diagnostics `active_signals: -1` (30 minutes)

Find the count query in `api/app/modules/provision/routes.py` (the diagnostics endpoint) and fix the active_signals count. It likely uses `.count()` vs. `scalar()` incorrectly.

### 3B. Voice input graceful fallback (30 minutes)

In `mobile/incident/page.tsx`, before rendering the mic button:
```typescript
const voiceSupported = typeof window !== "undefined" && 
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
```

When `!voiceSupported`, show:
```tsx
<div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 text-center">
  <p className="text-sm text-gray-500">Voice input isn't available on this browser.</p>
  <p className="text-xs text-gray-400 mt-1">Use the text field below to describe what happened.</p>
</div>
```

### 3C. Photo upload race condition fix (15 minutes)

In the mobile incident form, after `await axios.post(...incidents...)`:
```typescript
// Give the API 300ms to create the associated case
await new Promise(r => setTimeout(r, 300));
```

Also add one retry if the case query returns empty:
```typescript
let casesRes = await axios.get(`${API_URL}/cases`, { params: { incident_id: incidentId, limit: 1 } });
if (casesRes.data.length === 0) {
  await new Promise(r => setTimeout(r, 1000));
  casesRes = await axios.get(`${API_URL}/cases`, { params: { incident_id: incidentId, limit: 1 } });
}
```

### 3D. Finalization confirmation modal (1.5 hours)

In `cases/page.tsx`, OshaReadiness tab — wrap the finalize button with a confirmation dialog. Show "Type FINALIZE to confirm" input. This is the most important UX protection against data corruption.

### 3E. Add restart-api.sh script (15 minutes)

Create `/home/jesse/infra/apps/packguardian/restart-api.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "[packguardian] Restarting API only (no web rebuild)..."
lsof -ti:8105 | xargs kill -9 2>/dev/null || true
sleep 1
cd "$ROOT/api"
nohup .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8105 --log-level info \
  >> "$ROOT/.logs/api.log" 2>&1 &
disown
echo "[packguardian] Waiting for health check..."
for i in $(seq 1 10); do
  curl -sf http://localhost:8105/health > /dev/null 2>&1 && echo "[packguardian] API is up." && exit 0
  sleep 1
done
echo "[packguardian] Health check failed. Check .logs/api.log"
exit 1
```

---

## Phase 4 — Pilot Setup (Before First Pilot Operator) ~2 hours

This phase requires Jesse to answer Q1–Q5 from JESSE_REQUIRED_INPUTS.md first.

### 4A. Provision pilot tenant

If pilot customer gets their own tenant:
```bash
# Visit /onboard and create their company workspace
# Set their company name, colors, and admin email
# This takes ~10 minutes
```

### 4B. Set up center codes

For each location the pilot customer manages, verify the center codes match their existing labeling. Update the demo data seed or add real center entries via the org structure settings.

### 4C. Create staff accounts

- Send invites to staff via `POST /provision/invite`
- Or create accounts in bulk via the Users settings page

### 4D. Print and post QR codes

Generate QR codes for each center/room/kennel via the QR management section. Print and laminate. Post in staff-visible locations.

### 4E. Pilot briefing

Walk the pilot champion through:
1. How to submit an incident (10-minute demo)
2. How to review cases (5-minute demo)
3. How to escalate to a Safety Director Review (3-minute demo)
4. That email notifications don't exist yet (set expectations)

---

## Phase 5 — Post-Pilot Hardening (After 30 days of real data)

These are improvements to ship once the pilot is actively running and feedback is available.

### 5A. Email notifications (4–8 hours)
- Integrate Resend or SendGrid
- Send incident creation email to case supervisors
- Send overdue CA reminder email to assignees

### 5B. PWA installability (2 hours)
- Add `manifest.json` and Apple meta tags
- This turns the web app into a "fake native" app that operators can install from Safari

### 5C. Rate limiting on login (1 hour)
- Add `slowapi` dependency
- Apply rate limiter to `POST /auth/login`

### 5D. Password reset flow (4 hours, requires email from 5A)
- Add `POST /auth/forgot-password` endpoint
- Send reset link email
- Add `/reset-password?token=X` page

### 5E. Cloud file storage (1–2 days)
- Integrate Cloudflare R2 or Amazon S3
- Replace `FileResponse` with signed URL redirect
- Migrate existing uploads from local path

### 5F. Systemd services (2 hours)
- Create `packguardian-api.service` and `packguardian-web.service`
- Enable auto-restart on crash and reboot

### 5G. PDF export (2–3 days)
- Generate printable Form 300A using reportlab or WeasyPrint
- Add "Download PDF" button to OSHA page
- This is the most-requested OSHA feature from real operators

---

## Milestones

| Milestone | What it means | When |
|-----------|--------------|------|
| ✓ Phase 1 complete | Default password changed, is_active check added, CORS fixed | Today |
| ✓ Phase 2 complete | Files persist, demo reset is safe, logs rotate | Today |
| ✓ Phase 3 complete | Diagnostics fixed, voice fallback, upload race fixed | This week |
| → Phase 4 complete | First pilot operator has an account and filed their first incident | Before pilot |
| → Phase 5A complete | Email notifications working | First sprint post-pilot |
| → Phase 5C–D complete | Login hardened, password reset available | First month post-pilot |
| → Phase 5E–G complete | Cloud storage, systemd, PDF export | 60 days post-pilot |

---

## What Can Wait Until Post-Pilot

These are known gaps that will NOT block a successful pilot:

- Rate limiting (threat model is low at pilot scale)
- Password reset (Jesse can reset manually via DB if needed)
- Cloud file storage (if persistent local path is configured in Phase 2)
- Systemd service (manual restart is acceptable during pilot monitoring)
- Log rotation (won't fill disk in 30 days)
- Org hierarchy onboarding bug (workaround: build org structure manually post-onboarding)
- Mobile PWA installability (bookmarks work fine for pilot)
- Executive metric card drill-downs
- PDF export (operators can use the screen for now)

---

## Highest-Risk Areas for Pilot

1. **Email notifications absent** — operators will feel like the platform doesn't "do" anything after they submit. Training and expectation-setting are the mitigations.
2. **Voice input on iOS Safari** — silent failure. Fix before pilot if pilot operators use iPhones.
3. **Photo upload race condition** — occasional silent failure. The GAP-H8 fix (Phase 3C) mitigates this.
4. **Operator confusion about center codes** — the #1 field friction issue from the FIELD_ADOPTION_TEST. Must have center codes posted and pre-configured before launch.
5. **"Supervisor has been notified" is false** — this is the most trust-damaging gap. Either implement email (Phase 5A) or change the copy to be honest before pilot.

---

*PackGuardian — Final Hardening Plan*
*Estimated total effort: Phases 1–3 = ~8 hours | Phase 4 = 2 hours + Jesse inputs | Phase 5 = ongoing*
