# PackGuardian — Critical Pilot Blockers
*Ranked risk inventory for pre-pilot hardening*

---

## How to Read This

Each blocker is ranked by severity:
- **CRITICAL** — Will destroy pilot confidence. Must fix before first operator day.
- **HIGH** — Will cause significant friction or data integrity risk. Fix before week 2.
- **MEDIUM** — Will create confusion or missed value. Address during pilot.
- **LOW** — Affects polish or scale. Post-pilot.

---

## CRITICAL BLOCKERS

### C1 — File Storage Not Configured
**Risk:** Evidence photo uploads silently fail or store to a temp path that is wiped on restart  
**Symptom:** Operator uploads a photo as evidence. A week later, the photo is gone. Trust destroyed.  
**Fix:** Configure S3 or Cloudflare R2 bucket before pilot. Set `STORAGE_BUCKET_URL` in environment.  
**Effort:** Medium — 2–4 hours to configure cloud storage and wire upload endpoint  
**Status:** NOT FIXED  

---

### C2 — Demo Reset Wipes Production Data
**Risk:** An admin runs `POST /provision/reset-demo` against a live pilot tenant  
**Symptom:** All real incidents, cases, and corrective actions are wiped. Cannot be undone.  
**Fix:** Add a `DEMO_TENANT_ID` environment variable and lock reset-demo to that specific tenant.  
**Effort:** Low — add one UUID check in provision routes  
**Status:** NOT FIXED  

---

### C3 — No Finalization Confirmation UI
**Risk:** Operator clicks "Finalize" on an OSHA record with incorrect data. Cannot be reversed.  
**Symptom:** Employee name misspelled, wrong treatment type — now permanently locked in the OSHA 300 log.  
**Fix:** Add a confirmation modal: "Finalization is permanent. This will lock the record. Confirm?" with a text box to type "FINALIZE".  
**Effort:** Low — 1–2 hours UI change  
**Status:** NOT FIXED  

---

## HIGH BLOCKERS

### H1 — OSHA Recordability Can Be Wrong
**Risk:** Staff selects wrong treatment type → non-recordable incident appears on 300 log, or recordable incident is missed  
**Symptom:** At year-end, the 300 log is materially incorrect. OSHA audit exposure.  
**Fix:**
- Add tooltip on treatment_type field: "First aid = no prescription meds, no doctor visit. If they went to urgent care, select Medical."
- Add a "Confirm OSHA classification" prompt before finalization for borderline incidents
- Document clearly that operators are responsible for accuracy of treatment type selection  
**Effort:** Low — tooltip is trivial; confirmation prompt is 2 hours  
**Status:** PARTIAL (system correctly uses the treatment_type to determine recordability; input accuracy is on operators)

---

### H2 — No Email Notification System
**Risk:** Managers and executives have no pull trigger to log in  
**Symptom:** Cases sit unassigned for days because no one knows they exist. Executives never see dashboard.  
**Fix options:**
1. Configure SMTP (SendGrid, Postmark) and send email on: case created, case assigned, CA overdue
2. Near-term: Founder sends manual weekly briefing email
3. Near-term: Prompt champion to set a calendar reminder for daily case review  
**Effort:** Medium — SMTP integration is 4–8 hours  
**Status:** NOT FIXED — notifications are in-app only

---

### H3 — Center Code Validation Gap
**Risk:** Staff file incidents under `FL-JAX`, `FL JAX`, `fljax`, `FLJAX`, `Jacksonville`, `unknown`  
**Symptom:** Center health scores and pattern detection are broken by code fragmentation  
**Fix:**
1. Center code input now auto-uppercases (Phase 24 fix)
2. LocalStorage pre-fill reduces retype errors (Phase 24 fix)
3. Next fix: validate center code against known codes list on submit — warn if not recognized  
**Effort:** Low — add client-side validation against a fetched `/centers` list  
**Status:** PARTIALLY FIXED — auto-uppercase and memory done; validation still missing

---

### H4 — WebSocket Missed Events Not Replayed
**Risk:** Staff submits an incident; supervisor's browser had a network blip; event is never received; dashboard shows stale data  
**Symptom:** Supervisor checks Command Center 30 minutes after a reported incident; it doesn't appear. They assume nothing was filed.  
**Current mitigation:** 60-second polling fallback  
**Fix:** Ensure polling is reliable. The 60s polling is the correct mitigation at pilot scale.  
**Effort:** None (polling already in place)  
**Status:** MITIGATED (polling compensates; not a blocker at pilot scale)

---

### H5 — Investigation Brief Slow on Complex Cases
**Risk:** `GET /cases/{id}/brief` performs 90-day recurrence window query. At 500+ incidents may take 2–5s.  
**Symptom:** Case detail page hangs loading the investigation brief at high incident volume.  
**Current state:** ~80–120ms on 49 incidents. Acceptable.  
**Fix at scale:** Cache brief results for 5 minutes; invalidate on incident update.  
**Effort:** Low to medium  
**Status:** NOT A PILOT BLOCKER (acceptable at current scale)

---

### H6 — Duplicate Incident Submissions
**Risk:** Staff taps submit, doesn't see confirmation, taps again → two identical incidents  
**Symptom:** Same incident filed twice, two cases created, two sets of corrective actions  
**Current mitigation:** Submit button disabled during submission (`submitting` state)  
**Gap:** Back-button + re-submit scenario bypasses this  
**Fix:** Server-side dedup: reject if same `center_id + incident_type` within 60 seconds for same tenant  
**Effort:** Low — 20-line check in `create_incident` service  
**Status:** PARTIAL (client-side guard in place; server-side dedup missing)

---

### H7 — Auth Token Expiry During Long Investigation Sessions
**Risk:** Investigator spends 90 minutes building a case detail; token expires mid-session; edits silently fail  
**Current fix:** Global 401 interceptor redirects to login (Phase 22 fix)  
**Gap:** Unsaved form edits are lost when redirected  
**Fix:** Show "Session expiring in 10 minutes — save your work" toast at 50-minute mark  
**Effort:** Low  
**Status:** PARTIALLY MITIGATED — redirect works, but no warning before expiry

---

## MEDIUM BLOCKERS

### M1 — No Center Code Validation
**Risk:** Incident filed under an unrecognized center code causes silent data quality corruption  
**Fix:** Fetch centers list on form load; warn (not block) if entered code is not recognized  
**Status:** MEDIUM — adds friction if done wrong; skip if QR codes are primary intake method

---

### M2 — OSHA 300A Summary Not Auto-Generated
**Risk:** At year-end, operator cannot produce a complete 300A form; must manually compile  
**Fix:** Add a "Generate 300A" view that summarizes recordable incidents by classification  
**Effort:** Medium  
**Status:** LOW PRIORITY for pilot (field staff won't be finalizing records in month 1)

---

### M3 — No Offline Sync Visibility for Managers
**Risk:** Field staff submit offline reports; manager doesn't see them until device syncs  
**Symptom:** Manager at Command Center doesn't see a new incident for hours after it was filed  
**Current state:** Offline queue UI shows count on mobile; sync happens on reconnect  
**Fix:** "Pending sync" indicator in Command Center for admin users  
**Status:** MEDIUM — acceptable at pilot scale; inform champion during onboarding

---

### M4 — OSHA Finalization Irreversibility Not Clearly Communicated
**Risk:** Operator doesn't realize finalization is permanent until they try to edit a locked record  
**Fix:** Add a persistent warning in the OSHA tab: "Once finalized, this record cannot be edited. Review carefully."  
**Status:** MEDIUM — easy UI fix, low effort

---

### M5 — Pilot Metrics Not Surfaced to Founder
**Risk:** Founder cannot see pilot adoption without querying the database directly  
**Fix:** `GET /command/pilot-metrics` now returns adoption indicators (Phase 25 fix)  
**Status:** FIXED in Phase 25

---

## LOW PRIORITY

### L1 — No PDF Export
**Symptom:** Operator needs to send the 300 log to a lawyer or insurance carrier  
**Current state:** Print-to-PDF from browser works but is not formatted as an official form  
**Fix:** Formatted PDF generation  
**Status:** Post-pilot

### L2 — No HR System Integration
**Symptom:** Operator has to manually enter incident data in both PackGuardian and their HR/kennel management system  
**Status:** Post-pilot; product differentiator framing: "separate safety layer"

### L3 — Center Health Scores Computed on Every API Call
**Symptom:** At 100+ centers, `/command/center-health` will be slow  
**Fix:** Cache center health scores with 5-minute TTL  
**Status:** Not a pilot blocker

### L4 — No Rate Limiting on API
**Status:** Acceptable at pilot scale (single operator); add before public launch

---

## Pre-Pilot Minimum Requirement Checklist

These must be true before the first operator starts using the platform with real data:

- [ ] File storage configured (S3 or R2) — **C1**
- [ ] Demo reset locked to demo tenant — **C2**
- [ ] Finalization confirmation UI added — **C3**
- [ ] Treatment type tooltip added — **H1**
- [ ] Champion briefed on email notification gap — **H2**
- [ ] Center codes posted visibly at facilities — **H3**

Everything else can be addressed reactively during the pilot.

---

*PackGuardian — Phase 25 Pre-Pilot Hardening*
*Critical Pilot Blockers*
