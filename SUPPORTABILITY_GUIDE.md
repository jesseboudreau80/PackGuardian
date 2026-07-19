# PackGuardian — Supportability Guide
*How to support real operators when things go wrong*

---

## Overview

This guide describes how to diagnose and resolve issues that arise during a real pilot. It covers: what you can see, what you can fix remotely, what requires a restart, and what to tell operators while you're working on it.

---

## Quick Diagnostic Tools

### 1. System Diagnostics Endpoint
```
GET /provision/diagnostics
Authorization: Bearer <admin_token>
```
Returns: DB connection status, incident/case/CA counts, signal state, onboarding state, Python version.

Use this first when an operator reports "something's wrong." It confirms:
- The database is responding
- The tenant has data (not accidentally wiped)
- Signals were recently refreshed

### 2. Pilot Metrics Endpoint
```
GET /command/pilot-metrics
Authorization: Bearer <admin_token>
```
Returns: adoption indicators — sparse report %, missing employee name %, CA completion, overdue CAs, active signals.

Use this at weekly check-ins to assess pilot health without logging into the full UI.

### 3. Status Script
```bash
./status.sh
```
Runs locally. Shows: API process, web process, DB connection, environment validation, last 20 log lines.

### 4. Demo Reset (if using demo tenant)
```bash
./demo-reset.sh
```
Wipes and re-seeds demo data. Only run against demo tenant.

---

## Common Issues and Resolutions

### Issue: "I submitted an incident and it disappeared"
**Likely cause:** Offline queue was flushed or submission silently failed  
**Diagnose:**
1. Ask: "Were you online when you submitted?" If offline, check if the offline queue synced.
2. Check API logs: `tail -f api/logs/api.log | grep "create_incident"`
3. Check the tenant's incident count via `/provision/diagnostics`

**Resolution options:**
- If the incident never made it to the server: have staff re-submit
- If it's in the DB but not showing: check `GET /incidents` directly with admin token
- If it was filed under `center_id = "unknown"`: it's there, just mislabeled — update center_id via patch

---

### Issue: "The cases page won't load / shows an error"
**Likely cause:** Authentication token expired, or API is down  
**Diagnose:**
1. Ask: "Does it show 'Session expired' or a different error?"
2. If session expired: have user sign out and back in
3. Check API health: `GET /health` — if down, restart API

**Resolution:**
- Session expired: `localStorage.removeItem('access_token')` → re-login
- API down: `./stop.sh && ./start.sh`
- If API won't restart: check for port conflict (`fuser -k 8105/tcp`) and retry

---

### Issue: "Safety signals haven't updated in days"
**Likely cause:** Signals refresh wasn't triggered after recent incidents  
**Diagnose:**
1. Check `/provision/diagnostics` → `last_signal_refresh` timestamp
2. If stale: refresh manually

**Resolution:**
```bash
curl -X POST https://packguardian-api.jesseboudreau.com/signals/refresh \
  -H "Authorization: Bearer <admin_token>"
```
Or run `./demo-reset.sh` (demo tenant only) which triggers refresh automatically.

---

### Issue: "OSHA field says it's recordable but the operator says it shouldn't be"
**Likely cause:** Staff selected wrong treatment type during intake  
**Resolution:**
1. Open the case in the admin UI
2. Navigate to OSHA tab → edit `treatment_type`
3. Re-check recordability — the system will re-evaluate
4. If record is already finalized: admin override needed (DB update — see below)

**If finalized (admin override):**
This requires a direct DB update. Contact founder.
```sql
UPDATE incidents SET is_finalized = false, finalized_at = null, finalized_by = null
WHERE id = '<incident_id>';
-- Then update the incorrect field and re-finalize via UI
```
**Warning:** This bypasses the audit trail. Document separately.

---

### Issue: "A corrective action was completed but the system still shows it overdue"
**Likely cause:** Staff marked completed but `completed_at` wasn't set, or due_date bug  
**Resolution:**
1. Check CA status via API: `GET /cases/{case_id}/corrective-actions`
2. If status is "completed" but overdue flag is still showing: page refresh (client-side state issue)
3. If status is still "open": staff didn't click complete — walk them through it

---

### Issue: "Command Center showing wrong incident count"
**Likely cause:** Center code filed as "unknown" or mismatched  
**Diagnose:**
```
GET /incidents
```
Filter by `center_id = "unknown"` in the response. Count how many don't have a proper center.

**Resolution:**
- Patch each incident with correct center_id via `PATCH /incidents/{id}`
- Going forward: print center codes prominently, enable localStorage pre-fill (already done)

---

### Issue: "API is running but returning 500 errors"
**Diagnose:**
1. `./status.sh` — check if DB connection is up
2. API logs: `tail -100 api/logs/api.log | grep ERROR`
3. Check if a migration failed: look for `OperationalError` or `ProgrammingError`

**Resolution:**
- If DB connection: restart PostgreSQL
- If migration error: check `api/main.py` `_migrate_*()` functions for missing columns
- If unknown: restart API and check if error persists

---

## Environment Diagnostics Checklist

When a new environment is set up or something breaks mysteriously, verify:

```bash
# Environment variables
grep -E "DATABASE_URL|SECRET_KEY|ANTHROPIC_API_KEY|CORS_ORIGINS" api/.env | wc -l
# Should print 4 (or more)

# DB connection
cd api && .venv/bin/python -c "
from app.core.database import engine
from sqlalchemy import text
with engine.connect() as c:
    print(c.execute(text('SELECT count(*) FROM incidents')).scalar())
"

# API health
curl -s https://packguardian-api.jesseboudreau.com/health

# Web health  
curl -s -o /dev/null -w "%{http_code}" https://packguardian.jesseboudreau.com
```

---

## Operator Communication Templates

### When diagnosing (< 5 minutes)
> "I'm looking into this now. I'll have an update for you in the next few minutes."

### When it's a quick fix (< 30 minutes)
> "I found the issue — [brief explanation]. It's fixed. Please try again and let me know if it works."

### When it needs investigation (> 30 minutes)
> "I've identified what's happening and I'm working on a fix. I'll update you by [specific time]. In the meantime, [workaround if applicable]."

### When data is at risk
> "I want to make sure I understand the situation before making any changes. Can you tell me: what did you do last, and what were you expecting to happen? I don't want to change anything until I'm sure."

---

## What Operators Should Never Do Themselves

- Delete incidents (no delete function, but they shouldn't try)
- Run `/provision/reset-demo` unless they know it's a demo tenant
- Clear localStorage to "fix" something (will lose center code memory, auth state)
- Edit OSHA records after finalization without founder involvement

---

## Log File Locations

| Service | Log location | What to look for |
|---------|-------------|------------------|
| API | `api/logs/api.log` (if configured) or stdout | `ERROR`, `Exception`, `500` |
| Web | Browser console (F12 → Console) | Network errors, React errors |
| Nginx/proxy | System logs | 502, 504 errors |
| Cloudflare | Dashboard | Tunnel errors, SSL issues |

---

## Support Response Commitments

| Type | Target |
|------|--------|
| "I can't submit an incident" | Same day, 4 hours max |
| "A case is missing" | Same day |
| "Data looks wrong" | 24 hours |
| "Feature question" | 24 hours |
| "Feature request" | Acknowledged 48 hours |

**For urgent issues:** Ask operator to include "URGENT" in the subject.  
**Contact:** jesse.boudreau.dev@gmail.com

---

*PackGuardian — Phase 25 Pre-Pilot Hardening*
*Supportability Guide*
