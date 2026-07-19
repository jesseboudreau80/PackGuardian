# PackGuardian — Pilot Stability Priority List
*Top 10 most likely failure points during a real pilot — with mitigations*

---

## Priority 1: Stale Auth Token (FIXED in Phase 22)
**What breaks:** User's JWT expires mid-session, resulting in silent 401 failures or blank screens  
**Status:** ✓ Fixed — global axios 401 interceptor now redirects to login with "session expired" message  
**Remaining risk:** Token expires during a long investigation session; user loses unsaved work  
**Mitigation:** Warning toast after 50 minutes of inactivity (not yet implemented)  
**Severity:** High — breaks workflow without explanation

---

## Priority 2: Image Storage Not Configured (NOT FIXED)
**What breaks:** Evidence file uploads appear to succeed but files aren't actually stored  
**Status:** ✗ Not fixed — demo paths only, no real file storage backend  
**When this hits:** Any pilot user who tries to upload a photo as evidence  
**Mitigation:** Before pilot, configure S3/R2 or local persistent storage  
**Severity:** High — breaks a core workflow users will expect to work

---

## Priority 3: Center Code Unknown to Field Staff
**What breaks:** Mobile intake requires a center code; field staff don't know theirs  
**Status:** Partially mitigated — QR scan pre-fills center code  
**When this hits:** First time a field staff member reports an incident without QR scan  
**Mitigation:**
1. Print center codes and post them in staff areas
2. Create a "select from list" dropdown for center selection (medium effort)
3. Pre-fill last-used center code in localStorage  
**Severity:** Medium — adds friction, doesn't break flow

---

## Priority 4: Signal Detection Only On-Demand
**What breaks:** New incidents don't automatically update safety signals  
**Status:** Known gap — signals require manual `POST /signals/refresh`  
**When this hits:** A second incident happens at a location but signals don't update until someone refreshes  
**Mitigation:** Auto-trigger signal refresh after incident creation in the API  
**Fix:** 3-5 lines in `osha/routes.py` post-incident creation  
**Severity:** Medium — makes the pattern detection feel unreliable

---

## Priority 5: Demo Data Reset Wipes Real Data
**What breaks:** An operator accidentally runs `/provision/reset-demo` and loses real incident data  
**Status:** Known risk — reset-demo is admin-accessible and wipes everything  
**When this hits:** During a demo with a live tenant  
**Mitigation:**
1. `demo-reset.sh` only works against specific demo tenant
2. Add confirmation prompt before reset-demo in UI: "This will wipe all operational data. Type RESET to confirm."
3. Consider separate demo tenant vs production tenant  
**Severity:** High — catastrophic if it hits during a live pilot

---

## Priority 6: WebSocket Event Loss on Reconnect
**What breaks:** After a network interruption, the WebSocket reconnects but missed events are not replayed  
**Status:** Known limitation — no event replay mechanism  
**When this hits:** Mobile users in poor signal environments (kennels often have spotty WiFi)  
**Current behavior:** UI falls back to 60s polling — data updates eventually  
**Mitigation:** 60s polling is an adequate fallback; ensure polling interval is visible in UI  
**Severity:** Low — polling covers the gap, just slower

---

## Priority 7: Duplicate Incident Submission
**What breaks:** User submits the same incident twice (double-tap, back-button + resubmit)  
**Status:** Partially mitigated — `submitting` state disables button  
**When this hits:** User navigates back after submitting and hits submit again  
**Mitigation:** Server-side: check for incidents with same center_id + incident_type + created_at within 60s  
**Fix:** Add dedup middleware in `create_incident` (medium effort)  
**Severity:** Medium — creates duplicate cases that confuse investigators

---

## Priority 8: Investigation Brief Loads Slowly on Complex Cases
**What breaks:** The `GET /cases/{id}/brief` endpoint runs recurrence detection on 90-day window  
**Status:** Measured at ~80-120ms on 39 incidents; at 500+ incidents may be 1-3s  
**When this hits:** High-volume centers after 6+ months of real data  
**Mitigation:** Add brief response caching (5-minute TTL) and loading skeleton (already implemented)  
**Severity:** Low for pilot, medium at scale

---

## Priority 9: Offline Queue Not Visible to Manager
**What breaks:** Field staff submit offline reports; manager doesn't see them until sync occurs  
**Status:** Known gap — offline queue is local to the field staff device  
**When this hits:** Staff reports incident offline, manager is looking at Command Center expecting to see it  
**Mitigation:** Offline queue count visible in mobile header (already implemented); sync happens on reconnect  
**Severity:** Low — expected behavior, well-communicated

---

## Priority 10: OSHA Finalization Cannot Be Reversed
**What breaks:** An operator finalizes an incident with an error; they need to correct it  
**Status:** By design — finalized records are locked per OSHA audit trail requirements  
**When this hits:** Any operator who makes a data entry mistake before finalizing  
**Mitigation:**
1. Document clearly: "Finalization is permanent. Review carefully before finalizing."
2. Add confirmation step in finalization UI (not yet implemented)
3. Admin override endpoint exists but is DB-only currently  
**Severity:** Low for pilot (field won't be finalizing yet), high once OSHA compliance mode begins

---

## Quick Fix Priority Order

Fix these before first pilot launch (in order):

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | Configure real file storage | Medium | High |
| 2 | Auto-trigger signal refresh after incident creation | Low | Medium |
| 3 | Add finalization confirmation UI | Low | Medium |
| 4 | Print center codes for staff onboarding | None | Medium |
| 5 | Add reset-demo confirmation prompt | Low | High (safety) |

---

*PackGuardian — Phase 23 Pilot Launch Preparation*
