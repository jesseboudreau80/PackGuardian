# PackGuardian — Demo to Reality Gap Report
*What looks good in the demo that struggles in production*

---

## Why This Document Exists

Every demo environment is optimized for confidence. Real environments are optimized for survival. The gap between them is where pilots break down. This document is honest about where that gap is, so we can address it before it surprises a real operator.

---

## Gap 1: Report Quality

**In the demo:**
All incident reports have complete, well-written narratives. Employee names are filled in. Treatment types are selected. The investigation brief generates coherent, AI-enhanced summaries.

**In reality:**
Field staff file reports like this:
- "Slip near washing station. No injury."
- "Back pain from lifting. Will check in tomorrow with GM."
- "Dog bite right hand. First aid. Returned to work." (no employee name)

**What breaks:**
- Investigation brief generates thin content from sparse input
- OSHA readiness checker shows low completeness on most incidents
- Pattern detection works on incident_type and center_id — so even sparse reports contribute to signal detection, but the case detail page looks anemic

**What to do:**
- Acknowledge this in pilot onboarding: "Reports will be incomplete at first. That's normal. The system will prompt for more."
- The OSHA readiness checker already surfaces missing fields — lean on it
- Add: a "complete this report" prompt on the case page when key fields are missing

**Severity:** Medium — affects quality of investigation briefs, not core function

---

## Gap 2: Staff Discipline Around Center Codes

**In the demo:**
Every incident is filed under the correct center code. Center health scores are meaningful and accurate.

**In reality:**
- Staff don't know their center code (FL-JAX vs FLA-JAX vs Jacksonville vs "the kennel")
- Staff default to typing whatever they remember
- Some file under "unknown" because the code is required but they can't recall it

**What breaks:**
- Center health scores become inaccurate
- Signal detection misses patterns (two incidents at the same center but filed under different codes)
- OSHA 300 log is incomplete for the center

**What to do:**
- QR codes are the primary mitigation — QR scan pre-fills center code without typing
- Center code is now remembered in localStorage after first report (Phase 24 fix)
- For non-QR staff: print center codes prominently at the workstation, locker room, and break room

**Severity:** High — corrupts operational data if not managed

---

## Gap 3: Follow-Through on Corrective Actions

**In the demo:**
Corrective actions are created, assigned, and resolved within the demo narrative. The system looks clean and functional.

**In reality:**
- CAs are created in week 1, never updated
- Week 4: 15 open CAs, 8 overdue, 0 with notes
- The platform shows the debt clearly (overdue flags, "follow-up needed"), but it can't force action
- Managers with operational urgency treat CAs as optional

**What breaks:**
- Platform correctly identifies the problem (CA fatigue is visible in the system)
- But CA accumulation looks like platform failure to operators who haven't bought in
- Executive briefing shows growing overdue count, which is accurate but uncomfortable

**What to do:**
- Frame CAs as operational closure, not compliance paperwork
- During the first case review: create one CA with a specific, achievable task (not "fix the drain" but "call the plumber by Thursday")
- Close one CA together in the first month — show the champion what "resolved" looks like

**Severity:** High — CA fatigue is the #1 operational trust breakdown

---

## Gap 4: Voice Input Quality

**In the demo:**
Voice input captures a clear, complete narrative. The AI extracts incident type and severity accurately. The transcript is coherent.

**In reality:**
- Kennels are loud (120dB+)
- Staff report from outdoors, loading docks, or grooming rooms with equipment running
- Transcripts come out: "the dog bit him and she was near the um gate area and he needed band-aid"
- AI extraction confidence drops below 0.65 — no type auto-selection
- Users don't re-read or clean up the transcript

**What breaks:**
- Description field has garbled transcript
- AI type selection falls back to "general"
- OSHA fields aren't populated from extraction

**What to do:**
- The voice button is already positioned as optional (large by default, compact toggle after use)
- Recommend typed input in noisy environments — the follow-up questions flow works without voice
- Add: noise level detection in the browser (future) — recommend "use typing instead" if ambient noise is high

**Severity:** Medium — voice is an enhancement, not a dependency; most workflows still work

---

## Gap 5: Photo Upload Under Real Conditions

**In the demo:**
Photo upload works cleanly. Evidence appears in the case.

**In reality:**
- Photos from modern iPhones are 8–12MB HEIC files
- Upload on facility WiFi (often 2.4GHz, shared with surveillance cameras) fails silently
- Staff tap upload, see no response, tap again — two copies of the same photo, or an error
- Wet or gloved hands fumble the camera permission dialog

**What breaks:**
- Evidence upload either times out or uploads silently without confirmation
- Staff don't know if the photo was saved
- Photo appears in the case sometimes, not others — creates distrust

**What to do:**
- Phase 24 fix: client-side image compression before upload (>2MB compressed to ~500KB JPEG)
- The evidence tab should show upload confirmation state clearly (Phase 25 candidate)
- Alternative: tell staff to photograph evidence separately and email it to the champion, who attaches from desktop

**Severity:** Medium — photos are evidence enhancement; incidents can still be documented without them

---

## Gap 6: The "Someone Else Will Handle It" Problem

**In the demo:**
Cases are assigned to named individuals who take action. The investigation flow is shown from the perspective of someone who already understands their role.

**In reality:**
- Cases are created automatically but often unassigned
- Everyone assumes someone else will claim it
- "New" case status persists for days because no one owns the assignment step

**What breaks:**
- Cases age without action
- When the case is eventually picked up, the incident context has faded
- Corrective actions are created late or not at all

**What to do:**
- Pilot champions should own all case assignments for the first 30 days
- The system shows "unassigned" prominently — use that as a trigger in weekly reviews
- Future: auto-assignment rules (all FL incidents → FL safety director)

**Severity:** High — this is the most common day-30 failure pattern

---

## Gap 7: Executive Engagement Without Email Pull

**In the demo:**
The executive logs in, sees a beautifully populated dashboard, and understands the value immediately.

**In reality:**
- Executives don't log in unless they're pulled in (calendar reminder, email, Slack message)
- There's no email notification system currently
- The executive briefing and center health panel only deliver value if they're visited

**What breaks:**
- Executives don't see the value because they don't see the data
- At 90-day close: "I wasn't really using it myself"

**What to do:**
- Founder sends a weekly "safety briefing" email manually (copy-paste from executive briefing page) for the first month
- Schedule the 30-day and 60-day check-ins before the pilot starts
- Roadmap: email digest (weekly summary of open cases, top signals, overdue CAs)

**Severity:** Medium — affects conversion, not function

---

## Gap 8: Real-World OSHA Recordability Is Ambiguous

**In the demo:**
The platform clearly flags OSHA recordable incidents based on treatment type. The operator understands what "recordable" means.

**In reality:**
- "Did they need stitches?" → "I don't know, they went to urgent care"
- Treatment type is filled in by whoever reports the incident — may be wrong
- "First aid only" is selected by default, even when the injury was actually recordable
- Operators don't know the 1904.7 definition of "first aid"

**What breaks:**
- OSHA 300 log is under-populated
- Real recordable injuries classified as "first aid" → compliance gap
- Platform shows "OSHA: Non-recordable" on something that should be on the log

**What to do:**
- During onboarding: walk through the 3 recordability criteria explicitly
- Add tooltip on treatment_type field: "If in doubt, select the more severe option and the safety director will confirm"
- Future: "Confirm OSHA classification" step before finalization for borderline incidents

**Severity:** High — this is a compliance exposure, not a product problem per se

---

## Gap 9: The Demo Is One User; Reality Is Ten

**In the demo:**
The founder runs the full investigation flow from intake to resolution as a single user.

**In reality:**
- 10+ users with different roles, different access expectations
- Field staff can only submit — they can't see cases or corrective actions
- Some managers don't know their role in the system
- Someone asks "Can I see my own cases?" — the answer is yes, but they don't know how

**What breaks:**
- Role confusion in the first week
- Staff submit reports but don't hear back and assume nothing happened
- Managers expect email notification (not in the platform) when a case is assigned to them

**What to do:**
- Provide a role card at onboarding: what each person can do and what they'll see
- The "What happens next" success screen helps field staff (already implemented)
- In-app notifications appear in the bell icon for managers — confirm they know to check it

**Severity:** Medium — manageable with clear role communication at onboarding

---

## Gaps Summary: Priority Order

| # | Gap | Severity | Fix Type |
|---|-----|----------|----------|
| 2 | Center code discipline | High | QR codes + localStorage (24K done) |
| 6 | Unassigned cases | High | Process (champion owns assignments) |
| 8 | OSHA recordability errors | High | Education + tooltip |
| 3 | CA fatigue | High | Process (close one CA together) |
| 1 | Sparse report quality | Medium | Prompts for missing fields |
| 7 | No email → no exec engagement | Medium | Manual weekly email (near-term) |
| 9 | Multi-user role confusion | Medium | Role cards at onboarding |
| 4 | Voice in noisy environments | Medium | Accepted limitation |
| 5 | Photo upload reliability | Medium | Compression done (24K done) |

---

## What the Demo Is Right About

The demo is not misleading about:
- The speed of mobile intake (genuinely 45–60 seconds for a complete report)
- OSHA determination accuracy (the logic is correct when fields are correct)
- Signal detection reliability (patterns detect as described when incident volume is sufficient)
- Audit trail completeness (every event logged, actor tracked, timestamp immutable)

The gap is almost entirely about **human behavior** — what staff will and won't do without coaching — not about what the software does.

---

*PackGuardian — Phase 24 Operational Simulation*
*Demo to Reality Gap Report*
