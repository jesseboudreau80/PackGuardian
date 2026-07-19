# PackGuardian — Pilot Failure Modes
*What actually kills a pilot — and how to prevent it*

---

## How Pilots Die

Most software pilots don't fail because the software breaks. They fail because the human system around the software doesn't hold. This document catalogs the most likely failure modes for a PackGuardian pilot and what to do when you see the early warning signs.

---

## Failure Mode 1: No One Reports Incidents

**What it looks like:**
- Week 2: Zero incidents in the system
- Champion says "staff are still getting used to it"
- Command Center is empty

**Why it happens:**
- Staff don't know the center code
- Mobile intake feels unfamiliar (not a reflex yet)
- Staff fear the report will get them in trouble
- Manager hasn't modeled the behavior (hasn't reported anything themselves)

**Early warning sign:** Week 1 ends with fewer than 2 real incidents.

**Intervention:**
1. Walk the floor with the champion — find a real incident that happened in the last 48 hours and report it together
2. Confirm center codes are posted visibly (entrance, breakroom, manager's desk)
3. Address the fear: remind staff that PackGuardian is for documenting what happened, not for blame
4. Manager reports the next incident themselves, in front of staff

**Mitigation built into the platform:**
- The mobile intake is designed to feel like a phone habit, not a form
- "What happens next" success screen explains investigation ownership — not punishment

---

## Failure Mode 2: Reports Are Coming In But Cases Are Ignored

**What it looks like:**
- 10+ incidents in the system
- All cases status: "open", no assignments
- No corrective actions created

**Why it happens:**
- Champion is overwhelmed with day-to-day operations
- No one owns the dashboard check habit yet
- Cases feel like "more paperwork" rather than operational tools

**Early warning sign:** Week 3 — more than 5 open unassigned cases.

**Intervention:**
1. Sit with champion for 20 minutes — assign all open cases together
2. Create one corrective action for the most serious case
3. Establish: "Every Monday, 15 minutes, case review" as a calendar event
4. Reframe: "The case isn't paperwork — it's proof you handled it."

**Mitigation built into the platform:**
- Overdue CA flags are visible and persistent
- Command Center shows unresolved exposure prominently

---

## Failure Mode 3: Champion Goes Dark

**What it looks like:**
- Stopped logging in after week 2
- Emails go unanswered
- Staff has no one driving adoption internally

**Why it happens:**
- Champion was "voluntold" rather than self-selected
- Competing operational priorities (opening a new location, staff turnover)
- Pilot felt like extra work, not a relief

**Early warning sign:** No login from champion in 7 days.

**Intervention:**
1. Call (not email) — "I noticed you haven't had a chance to log in. What's making it hard?"
2. Simplify: shift the pilot to just one workflow (mobile intake only, no investigation for now)
3. If champion is truly wrong person: ask to identify a new internal owner
4. Offer to do the onboarding call again from scratch

---

## Failure Mode 4: Executives Ignore the Dashboard

**What it looks like:**
- Admin logins from owner/director: zero after initial demo
- Executive briefing page never loaded
- Center health scores unchanged for weeks despite new incidents

**Why it happens:**
- Executives don't have a trigger to check (no email notification)
- Dashboard feels like "another thing to log into"
- They're not sure what they're supposed to do with what they see

**Early warning sign:** No executive login in 14 days.

**Intervention:**
1. Schedule a 10-minute monthly call: "Let me walk you through what the data shows"
2. Surface one specific insight from their data: "FL-JAX has had 3 slip incidents in 14 days — here's what that means"
3. Make the value concrete: "If you had been checking this last month, you'd have seen the pattern 8 days earlier"

**Known gap:** No email notification system currently. Executives have no pull trigger. This is a product gap.

---

## Failure Mode 5: Field Staff Distrust the Platform

**What it looks like:**
- Staff refusing to report digitally ("I'll just tell my manager")
- Complaints about surveillance
- Resistance from union-adjacent roles or senior field staff

**Why it happens:**
- Platform was introduced without explaining WHY it protects staff
- Previous incident management was punitive
- Staff assume reports will be used against them in HR

**Early warning sign:** Champion hears "I don't want to be in the system."

**Intervention:**
1. Acknowledge it directly: "This is a fair concern. Here's who can see this report: [champion + safety director]. Not HR unless it escalates."
2. Reframe: "When you report an incident, we create a case. That case is your protection — it documents that you handled it correctly."
3. Have champion model the behavior: report a real near-miss themselves, then show staff what was created
4. Do NOT force reporting. Voluntary adoption builds sustainable habits.

**What to say:**
*"The app documents what you did. If something goes wrong later, you have proof you reported it, who handled it, and what was done. Without this, it's your word against whatever the paperwork shows."*

---

## Failure Mode 6: Alert Fatigue

**What it looks like:**
- Command Center shows many warnings
- Champion stops looking at signals
- "Everything is flagged" — signals lose meaning

**Why it happens:**
- 49 incidents generate patterns that seem constant
- Staff interpret every flag as a crisis when most are informational
- The platform hasn't been calibrated to their specific operational baseline

**Early warning sign:** Champion says "I don't know what to pay attention to."

**Intervention:**
1. Walk through signals together: distinguish "monitoring" (temporal cluster) from "urgent" (critical escalation)
2. Help them understand the difference between a signal (a pattern to watch) and an alert (an action required)
3. If they have multiple centers, focus attention on the bottom 2–3 by center health score

**Platform language note:** The terminology "Safety Signal" vs "Escalation" is already distinct. Make sure champions understand this difference during onboarding.

---

## Failure Mode 7: Poor Onboarding — Platform Feels Overwhelming

**What it looks like:**
- Champion received access, logged in once, didn't know where to start
- Week 1 ends without a single real workflow completed
- Champion describes platform as "complex" or "confusing"

**Why it happens:**
- No guided first-use experience
- Too many features visible at once
- Champion was given admin access but doesn't know what admin means

**Early warning sign:** Champion's first session: 3 minutes, no incidents created.

**Intervention:**
1. Do the onboarding call the day access is granted, not after
2. In the first call: create one incident together, assign one case, create one CA
3. End the call with: "That's 90% of what you'll do in this system. Everything else is when you're ready."

**Known gap:** No guided onboarding wizard in the current product. This is a Phase 25 candidate.

---

## Failure Mode 8: The Data Is Wrong and No One Notices

**What it looks like:**
- Incidents filed under wrong center
- OSHA recordability determination wrong (user selected wrong treatment type)
- Same incident filed twice
- Case closed without resolution

**Why it happens:**
- Staff entering wrong center code (FL-JAX vs FL-JAX-2)
- Treatment type options misunderstood ("first aid" vs "medical" boundary)
- No data review step in the current workflow

**Early warning sign:** Multiple incidents with `center_id = "unknown"`.

**Intervention:**
1. Do a weekly data quality review with champion: scan for `center_id = unknown`, duplicate incidents, OSHA misclassifications
2. If center code errors are common: print codes, or switch to list-based selection
3. For OSHA misclassifications: walk champion through the three criteria for recordability

---

## Failure Mode 9: Pilot Succeeds But Conversion Fails

**What it looks like:**
- 90 days of real usage
- Legitimate value demonstrated
- But: champion says "We don't have budget" or "We need to involve legal" or "Let me check with the owner"

**Why it happens:**
- Value wasn't quantified during the pilot (anecdotes, not numbers)
- Decision-maker wasn't involved during the pilot
- The "ask" (pricing, timeline) came as a surprise

**Early warning sign:** 60-day check-in: operator hasn't mentioned next steps unprompted.

**Intervention:**
1. At day 30: ask explicitly "What would make this worth continuing after 90 days?"
2. Document the value in numbers: time saved, incidents documented, corrective actions closed
3. Involve the owner/decision-maker by day 60, not day 90
4. Name the ask before day 90: "We'll talk about continuing this on [date]. I'd like to show you the numbers then."

---

## Summary: Early Warning Signals

| Week | Danger Sign | Immediate Action |
|------|-------------|-----------------|
| 1 | < 2 incidents reported | Walk the floor, report one together |
| 1 | No champion login in 5 days | Call (not email) |
| 2 | > 5 unassigned open cases | 20-min case review call |
| 3 | Staff describing it as surveillance | Address fear directly — privacy explanation |
| 4 | Champion says "too complex" | Simplify: one workflow only |
| 6 | No executive logins | Proactive briefing call with the data |
| 8 | "We'll talk about pricing later" | Name the ask now |

---

## What We Can Control vs. What We Can't

**We can control:**
- Quality of onboarding
- Platform usability and language
- Response time when problems arise
- How we frame the product's purpose

**We cannot control:**
- Internal champion's workload and authority
- Cultural willingness to document incidents
- Whether executives engage with operational data
- Whether the pilot timeline aligns with budget cycles

**If a pilot is failing:** Diagnose which category the blocker is in before deciding whether to push harder or accept the outcome.

---

*PackGuardian — Phase 24 Operational Simulation*
*Pilot Failure Modes*
