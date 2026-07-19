# PackGuardian — Executive 90-Second Test
*What a distracted executive notices, ignores, and misunderstands*

---

## The Scenario

An operator's VP of Operations logs in for the first time after being told "you should check this thing out." She has 90 seconds before her next call. She's on a laptop, never seen the platform.

---

## Second 0–10: Login

She types her email and password. Login works immediately.

**What she notices:** Login was fast.  
**What she doesn't notice:** There's a "session expired" redirect behavior she'll never see.  
**Risk:** None.

---

## Second 10–20: Landing (Command Center)

The default page after login is `/command`. She sees:

- Header with company name and nav links
- 4 metric cards: total incidents, open cases, escalations, overdue CAs
- "Safety Signals" section
- "Center Health" panel
- Some quick links at the bottom

**What she notices first:** The numbers. "37 incidents this month" — she doesn't know if that's good or bad.  
**What confuses her:** "Escalations" — she's not sure what escalation means in this context. Is it bad?  
**What she ignores:** The Center Health panel — it's below the fold on her screen, she never scrolls.  
**What she clicks:** One of the incident numbers. Nothing happens — they're not links.

**Critical gap:** The metric cards are not clickable. She expects them to drill down. They don't.  
**Friction:** "Escalations" needs a plain-English label. "Escalations" → "Cases Flagged for Review"

---

## Second 20–35: Safety Signals

She sees the Safety Signals section with 3–4 active signals:
- "Incident Burst — FL-JAX — 3 incidents in 14 days"
- "Repeat Incident Type — NY-BRK — sanitation"

**What she notices:** The orange/red colors signal urgency. She understands something is wrong at FL-JAX.  
**What she doesn't understand:** "Incident Burst" — is that a technical term? What does she do about it?  
**What she ignores:** The "Dismiss" button — she doesn't know what dismissing does.  
**What she wants:** A single sentence explaining what to do next.

**Critical gap:** Signals explain the pattern but don't say "Contact the FL-JAX general manager" or "Review these 3 cases."  
**Fix:** Add a "Recommended action:" line to each signal — one sentence.

---

## Second 35–50: Navigation Confusion

She looks at the nav bar: Command, Executive, My Shift, Safety Intel, Cases, OSHA, Field Map, Field Ops.

**What she thinks:** "Executive" sounds like what she should be on. She clicks it.  
**What she sees:** KPI grid, week-over-week trend, risk band distribution  
**What she notices:** "Risk Band Distribution" — she doesn't know what a risk band is.  
**What she clicks:** Nothing — she can't figure out what's actionable.

**Critical gap:** The executive briefing page is data-rich but action-poor. There's no "Here's what needs your attention" summary at the top.  
**Fix:** Add a 2-sentence summary at the top of the executive page: "This week, [X] new incidents were reported. [Y] centers need immediate attention."

---

## Second 50–65: Cases (Accidental Discovery)

She clicks "Cases" from the nav. She sees a list of cases with statuses: Open, Assigned, Investigating.

**What she notices:** Most cases are "Open" — that seems like a lot of unresolved things.  
**What she wants to know:** "Which of these need MY attention?"  
**What she actually sees:** All cases, sorted by creation date, with no clear filter for high-priority.

**What she ignores:** The left sidebar filters — she doesn't understand what "Escalation Level" means.  
**What she clicks:** One case. She opens it. She sees a lot of information — 7 tabs.

**Critical gap:** No "Needs Your Attention" filter. The cases list requires too much reading to prioritize.  
**Fix:** Add a "Needs Review" badge/filter that surfaces: escalated cases + cases with overdue CAs.

---

## Second 65–80: Case Detail (The Good Moment)

She opens the Zeus GA-ATL case (escalated, 2 incidents, critical).

**What she sees:**
- Incident description — clear, reads like a real operational event
- Investigation brief with risk score (82/100)
- "This is the second incident involving Zeus in 25 days"
- Open corrective actions with names assigned

**What she notices:** This actually makes sense. She understands the situation.  
**What she feels:** This is useful. She wants to see this for all her locations.  
**What she wants to do:** Forward this to her operations director. She can't — there's no share button.

**This is the value moment.** When she sees a real operational pattern explained in plain language, she gets it.

---

## Second 80–90: Exit

Her call starts. She closes the browser.

**What she remembers:** The FL-JAX problem, and the Zeus case. That's it.  
**What she doesn't remember:** Risk bands, signal types, escalation levels, tabs.  
**Would she come back?** Depends on whether someone follows up: "Did you see FL-JAX? Here's what I'd do."

---

## Summary: What the Executive Sees in 90 Seconds

| Moment | What She Sees | Reaction |
|--------|--------------|----------|
| Metric cards | Numbers without context | Confused |
| Safety signals | Color-coded patterns | Understands urgency |
| "Escalations" label | Unclear term | Skips |
| Executive page | Data, no action | Skips |
| Cases list | Long, no priority filter | Overwhelmed |
| Zeus case detail | Clear operational narrative | Value moment |

---

## What Changes Based on This Test

**Must fix before exec demo:**
1. Metric cards should link to filtered case lists when clicked
2. Signal cards need a "Recommended action:" line in plain English
3. Executive page needs a 2-sentence "This week" summary at the top
4. Remove or rename "Escalations" → "Cases Flagged for Review"

**Should fix:**
5. Cases list: "Needs Review" quick filter
6. Case detail: Share button (copy link)

**Accept for now:**
7. Risk band terminology — explained in tooltips, acceptable at pilot scale

---

## The 90-Second Value Threshold

She will not return if, in 90 seconds, she doesn't see:
- One thing that feels operationally real (not generic)
- One thing that requires her attention (not just information)
- One thing she can do immediately (not just observe)

The Zeus case delivers all three. Get her there in under 60 seconds.

**The fastest path to value:** Skip the Command Center. Start on the Cases page filtered to escalated/critical.

---

*PackGuardian — Phase 25 Pre-Pilot Hardening*
*Executive 90-Second Test*
