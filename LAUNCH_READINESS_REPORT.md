# PackGuardian — Launch Readiness Report
**Generated:** 2026-05-17  
**Phase:** Production Readiness + Operational Trust  
**Version:** Enterprise Architecture (post-Phase 18)

---

## Executive Summary

PackGuardian is **pilot-ready**. The core investigation workflow is complete end-to-end: mobile incident intake → AI extraction → case creation → corrective actions → witness collection → timeline → OSHA recordability → risk scoring. The platform tells operational safety stories with enough realism to drive pilot user trust.

**Recommended launch posture:** Closed pilot with 2–3 trusted operators in late May 2026, targeting full soft launch in June 2026.

---

## Critical Blockers (must fix before any pilot)

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 1 | **Default admin password is `changeme`** | Security — any public URL exposes full admin | Change in `.env` or force-reset at first login |
| 2 | **ANTHROPIC_API_KEY not set** | AI extraction falls back to rule-based; witness synthesis unavailable | Add to `api/.env` — low cost, high demo value |
| 3 | **No email transport configured** | Notifications send to DB but no email delivery | Set SMTP in `.env` or use a transactional provider (Postmark, Resend) |
| 4 | **No file storage backend** | Evidence uploads reference local paths that don't persist across restarts | Configure S3/R2 or local persistent mount before evidence demo |

---

## Medium Issues (fix before soft launch)

| # | Issue | Impact | Workaround |
|---|-------|--------|------------|
| 1 | Risk score backfill | Existing demo incidents have `operational_risk_score = null` until updated | Re-seed demo data or run backfill script after restart |
| 2 | Signal auto-refresh | Safety signals only update on `POST /signals/refresh` — not on new incidents | Wire refresh call into incident creation route |
| 3 | Mobile layout on small screens | Cases page detail panel is desktop-optimized; collapses badly on sub-375px screens | Add explicit mobile breakpoint for case detail routing |
| 4 | QR code scan fallback | `jsqr` library requires camera permission; some Android browsers block it | Add clearer permission-request UI before scan button |
| 5 | Escalation PATCH triggers risk recalculation | Escalation level change via PATCH /cases/{id} does not call `apply_risk_score` | Add hook in cases/routes.py escalation path |
| 6 | Demo data signal detection | Signals are empty until `POST /signals/refresh` is called after seeding | Auto-call refresh in `seed_demo_data()` or in provision route post-seed |

---

## Polish Opportunities (before investor demos)

| # | Opportunity | Value |
|---|-------------|-------|
| 1 | **Risk score contributors visualization** — show a mini bar chart of the 7 score contributors | High — makes risk score feel explainable, not magic |
| 2 | **"Resolution Summary" tab** — when a case is resolved, show a one-page summary with: incident → key CAs completed → timeline highlights → OSHA outcome | High — closes the operational loop |
| 3 | **Tenant branding** — show org name and logo in header instead of "PackGuardian" for white-label feel | Medium — important for pilot psychology |
| 4 | **Quick case filter by center** — filter case list by center_id for multi-location operators | Medium — critical for 5+ center operators |
| 5 | **Case export PDF** — one-button export of a case summary as a PDF (incident, CAs, witnesses, timeline) | Medium — often requested for insurance/OSHA audit |
| 6 | **Print-ready OSHA 300 form** — current form is DB-only; a print CSS or PDF export covers the regulatory filing workflow end to end | Medium |
| 7 | **iOS Safari voice input polish** — `webkitSpeechRecognition` works but dialog is unstyled; add explicit "Listening…" overlay | Low |
| 8 | **Empty state illustrations** — replace text-only empty states with subtle icons or minimal illustrations | Low |

---

## Navigation Dead Ends (user experience gaps)

| Location | Issue |
|----------|-------|
| Mobile scan → QR not found | Error message appears but no path forward (no "Report Incident Without QR" CTA) |
| OSHA postings page | "Generate Form 300A" produces JSON but no download link |
| Work page → My Tasks | Completed tasks have no "reopen" action visible |
| Case detail → Copilot | Copilot tab doesn't show citation sources for recommendations |

---

## Auth / Security Edge Cases

| Issue | Notes |
|-------|-------|
| JWT expiry handling | Token expiry triggers 401 but frontend shows blank screen; should redirect to login with `from` param |
| Invitation link expiry | `/join/{token}` gives a 404 if the invite is used twice — should show a clear "already used" message |
| Role escalation | A `manager` role user can see admin-only routes via direct URL (no route guard on OSHA posting delete) |
| `is_active` not enforced on login | Deactivated users can still log in (the flag exists in DB but isn't checked in auth flow) |

---

## Offline / Connectivity UX

| State | Current Behavior | Recommended |
|-------|-----------------|-------------|
| No network at incident submit | Correctly queues to `OfflineQueue` | Good — show "Saved offline" message more prominently |
| Partial network (slow kennel WiFi) | Requests timeout silently | Add 10s timeout + explicit retry prompt |
| OfflineQueue sync failure | Silently drops on sync error | Show sync failure count with "Retry" CTA in mobile header |

---

## Performance Notes

| Area | Observation | Recommendation |
|------|-------------|----------------|
| Command Center | Re-fetches full summary every 60s even when nothing changed | Add `If-None-Match` ETag or reduce polling to 120s |
| Cases page | Loads all cases for tenant at once; no pagination | Fine for pilot (<50 cases), needs pagination at 200+ |
| Risk scoring | Called synchronously in request path — adds ~50ms | Acceptable for now; move to background task at scale |
| Evidence analysis | AI analysis blocks upload response | Already async via background analysis — good |

---

## Recommended Pilot Rollout Plan

### Phase 1: Internal Walkthrough (Week 1)
**Who:** You + 1 trusted operator partner  
**Goal:** Validate full incident → case → resolution flow end-to-end  
**Checklist:**
- [ ] Change admin password
- [ ] Set ANTHROPIC_API_KEY
- [ ] Re-seed demo data with corrective actions + witnesses
- [ ] Run `POST /signals/refresh` to populate signals
- [ ] Walk through: mobile incident report → case assignment → corrective action → close
- [ ] Test QR scan flow on Android + iOS

### Phase 2: Soft Pilot (Weeks 2–3)
**Who:** 1–2 real pet care operators (kennel managers, not enterprise admin)  
**Goal:** Field test mobile intake in real operational conditions  
**Onboarding script:**
1. "Here's how to report an incident from your phone" → Mobile intake demo
2. "Here's how we track what happened" → Case + timeline walkthrough  
3. "Here's the pattern detection" → Command Center + Safety Signals
4. "Here's what OSHA sees" → OSHA 300 log preview

**Success metrics:**
- Operator reports at least 1 real incident using mobile intake
- Case is created, assigned, and has at least 1 corrective action
- No critical bugs blocking the intake → case → resolution flow

### Phase 3: Investor Demo (Week 3–4)
**Demo script (15 minutes):**

1. **Field scenario** (5 min) — Live mobile incident report using voice intake. Show AI extraction + OSHA flag. Show case auto-created.
2. **Investigation view** (4 min) — Open case detail. Show timeline, corrective actions with overdue highlighting, witness statements.
3. **Command Center** (3 min) — Show safety signals, escalation pulse, risk scoring. "This is what the safety director sees at 7am."
4. **Enterprise scale** (2 min) — Map view showing 20 centers. OSHA 300 log. QR scan at a center.
5. **The pitch** (1 min) — "30 minutes to first incident report. Works offline. OSHA-ready from day one."

---

## Recommended First Pilot Users

| Persona | Why | What to show them |
|---------|-----|-------------------|
| **Kennel operator, 3–5 locations** | Power user — will stress test multi-location features | Mobile intake, case assignment across centers, QR workflows |
| **Pet care franchise safety coordinator** | Needs OSHA compliance + reporting | OSHA 300 log, escalation tracking, signal detection |
| **Grooming chain owner** | High grooming incident volume | Grooming incident types, corrective actions, timeline |
| **Veterinary boarding operator** | OSHA-sensitive, medically literate | Recordability logic, OSHA forms, employee injury workflow |

---

## System Health at Report Date

| Component | Status | Notes |
|-----------|--------|-------|
| API | ✅ Running | Port 8105, Cloudflare tunnel active |
| Web | ✅ Running | Port 3005, Cloudflare tunnel active |
| Database | ✅ Running | PostgreSQL, all tables present |
| AI Extraction | ⚠️ Rule-based fallback | No ANTHROPIC_API_KEY set |
| Witness Synthesis | ⚠️ Rule-based fallback | Requires ANTHROPIC_API_KEY |
| Email notifications | ❌ Not configured | SMTP not set |
| Evidence storage | ⚠️ Demo paths only | No persistent file storage backend |
| Safety signals | ⚠️ On-demand only | Not auto-refreshed on new incidents |
| Risk scoring | ✅ Auto-pipeline | Runs on: incident create/update, CA add/update, witness add |
| Demo data | ✅ Rich | 31 incidents, 20 centers, 16 corrective actions, 7 witness statements |

---

*Generated by PackGuardian Phase 18 — Production Readiness Sprint*
