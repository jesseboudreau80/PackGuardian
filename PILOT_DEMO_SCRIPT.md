# PackGuardian — Pilot Demo Script
**Duration:** 12–18 minutes  
**Audience:** Potential pilot users, investors, safety coordinators  
**Goal:** Show that PackGuardian works the way field teams actually work — fast, operational, trustworthy

---

## Before You Start

**Check these are working:**
- [ ] Logged in as `admin@packguardian.com` (or a demo user)
- [ ] Mobile device ready (the demo works best with real phone)
- [ ] Demo data seeded (`POST /provision/reset-demo`)
- [ ] Signals refreshed (`POST /signals/refresh`)
- [ ] Both URLs live: `packguardian.jesseboudreau.com` and `packguardian-api.jesseboudreau.com`

**The story you're telling:**  
*"A dog bite happened this morning at a busy kennel. We're going to walk through exactly what happens in PackGuardian — from the moment it gets reported to the moment it's resolved and documented."*

---

## Scene 1 — Mobile Incident Report (3 min)

**Open on:** `/mobile` on a phone (or browser in mobile view)

**Say:**
> "This is what a kennel team member sees when they open PackGuardian on their phone. It's their shift dashboard. They can see how many cases are assigned, overdue tasks, and active incidents. But right now, something just happened."

**Action:** Tap "Report Incident"

**Say:**
> "They choose what kind of incident it is. The platform doesn't ask them to fill out a form first — it asks them what happened."

**Action:** Tap "Dog Bite"

**Say:**
> "Now it asks a few quick questions. Did the skin break? Who was injured? Was medical treatment needed? These aren't bureaucratic checkboxes — they're questions that determine whether this is OSHA-recordable. The platform figures that out automatically."

**Action:** Answer "Yes" to skin broken, "Team member", "Emergency room"

**Say:**
> "Watch — just answering those questions triggered an OSHA flag. The system knows this incident needs regulatory review."

**Show:** The OSHA warning banner appearing

**Action:** Tap "Continue" → tap the microphone button

**Say:**
> "Most field staff won't type on a phone in a chaotic kennel. Voice is faster. Watch what happens."

**Action:** Tap the push-to-talk button, speak:
> *"Golden retriever in kennel C-4, bit Sara on the left forearm during morning feeding. She's okay, wound was cleaned. She went to urgent care for stitches. Dog has no prior bite history in our system."*

**Action:** Tap stop

**Say:**
> "The AI just analyzed that description. It extracted the key facts — injury type, body part, treatment, the dog — and it's asking follow-up questions. Did I miss anything? Let me add the center."

**Action:** Fill in center code "NY-MAN" → tap Submit

**Say:**
> "Done. The report is in. A case was automatically created, and the safety coordinator is already notified."

---

## Scene 2 — Command Center Update (2 min)

**Switch to:** Desktop browser, `/command`

**Say:**
> "Meanwhile, on the other end of the organization, the safety director opens the Command Center. They can see — in real time — what's happening across all 20 locations."

**Point to:** The escalated cases panel, the risk metrics

**Say:**
> "This isn't a static report. It's live. The incident we just submitted is reflected here. Risk score is calculated automatically — severity, OSHA exposure, repeat patterns, missing documentation. The system knows what to worry about."

**Point to:** Safety Signals panel

**Say:**
> "And here — Safety Signals. These are operational patterns. Not rule violations. The system noticed there have been two escalated cases in the last 90 days. That's a pattern worth knowing about."

---

## Scene 3 — Case Investigation (4 min)

**Navigate to:** `/cases`, click the most recent case (dog bite from Scene 1)

**Say:**
> "Now we're in the investigation workspace. This is where the actual work happens."

**Point to:** Investigation Brief card at top

**Say:**
> "At the top, you get an operational briefing — what happened, the risk score with its contributors, who's involved, and what the recommended next step is. You don't have to piece it together yourself."

**Action:** Click "Risk factors" dropdown

**Say:**
> "You can see exactly what's driving the risk score. Severity base, OSHA recordable flag, escalation level — named contributors, not a black box."

**Point to:** Recurrence patterns (if any)

**Say:**
> "If this dog, this location, or this type of incident has happened before — it shows up here. That's how we catch patterns before they become problems."

**Action:** Click "Corrective Actions" tab

**Say:**
> "Now the investigation team can create corrective actions directly in the case. They assign them, set due dates, track completion. When something is done, they mark it complete right here."

**Action:** Show an existing corrective action from demo data, click the circle to mark done (demo: don't actually complete it)

**Say:**
> "One tap to complete. No navigating away, no separate task system."

**Action:** Click "Witnesses" tab

**Say:**
> "If there were witnesses, their statements go here. And when you have two or more — the system can synthesize what they agree on, where accounts differ, and what information is still missing."

---

## Scene 4 — OSHA Documentation (2 min)

**Navigate to:** `/osha`

**Say:**
> "For pet care operations, OSHA compliance is real. PackGuardian tracks everything needed for the 300 log automatically. Any incident that qualifies as recordable — days away, restricted duty, medical treatment — shows up here."

**Show:** The OSHA 300 log table

**Say:**
> "And at year end, the 300A summary that must be posted? It's generated here. One click. No spreadsheets."

---

## Scene 5 — QR Scan + Mobile Intelligence (2 min)

**On phone:** Navigate to `/mobile/scan`

**Say:**
> "One more thing. Every kennel, play yard, grooming station, and piece of equipment can have a QR code. When a staff member scans it before starting their shift, they see the operational context for that location instantly."

**Action:** Enter code "FL-MIA" manually

**Say:**
> "This location has had recent incidents, open corrective actions. The QR scan tells you that before you start work. Before something happens again."

---

## Scene 6 — The Close (1 min)

**Say:**
> "From first report to full investigation, corrective actions, OSHA documentation, and operational pattern detection — all in one platform. Under 30 minutes to set up for a new location. Works offline in the kennel. Designed for the way field teams actually work."

**Key points to land:**
- "OSHA-ready from day one"
- "Works on any phone, no app install"
- "Real-time pattern detection across all locations"
- "30 minutes to first incident report"

---

## Common Questions and Answers

**"What if staff don't want to use it?"**  
> The mobile intake takes under 60 seconds. Voice entry means no typing. It's faster than any paper form or email chain.

**"Do you store sensitive employee data?"**  
> All data is tenant-isolated. HR-only comments are only visible to HR roles. Employee medical records are protected by visibility controls.

**"Does it integrate with our existing systems?"**  
> The API is open. We have webhook support for incident events. Export to PDF and OSHA forms is built in.

**"What does it cost to run?"**  
> Infrastructure runs ~$40/month. AI extraction (Claude) costs pennies per incident. There's no per-seat pricing during pilot.

**"What happens offline?"**  
> Mobile reports queue locally and sync automatically when connection is restored. Staff see a clear "Saved offline" confirmation.

---

## Demo Recovery (if something breaks)

| Problem | Recovery |
|---------|----------|
| API 500 | Refresh. If down: `bash start.sh` on server |
| No demo data | `POST /provision/reset-demo` |
| No signals | `POST /signals/refresh` |
| Risk scores missing | `POST /provision/backfill-risk-scores` |
| Login fails | admin@packguardian.com / changeme |
