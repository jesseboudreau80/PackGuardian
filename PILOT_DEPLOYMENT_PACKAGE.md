# PackGuardian — Pilot Deployment Package
*Complete operational guide for launching a pilot with a new operator*

---

## What This Package Covers

This document describes everything needed to launch a PackGuardian pilot with a real pet care operator — from the first conversation to day 90.

---

## Section 1: Pre-Pilot Agreement

### What the Operator Gets
- Full platform access for 90 days, free
- Up to 25 locations configured
- Unlimited user accounts
- Direct founder support (Slack/email, same-day response to blockers)
- Weekly optional 30-minute check-in
- Product roadmap visibility and input priority

### What We Ask For
- 1 internal champion designated (name, email, role)
- Commitment to: at least 10 real incidents reported during the pilot
- Monthly 30-minute feedback call
- At the 90-day close: willingness to discuss continuation and reference

### Pilot Timeline

| Week | Goal |
|------|------|
| 1 | Platform live, first incident submitted, team onboarded |
| 2–3 | Regular incident reporting established |
| 4 | First case investigated through to corrective action |
| Month 2 | OSHA log reviewed, pattern detection explored |
| Month 3 | ROI assessment, continuation decision |

---

## Section 2: Operator Onboarding Checklist

### Day 0 (Before Launch)

**Founder side:**
- [ ] Confirm operator contact info and champion name
- [ ] Set up tenant (via `/provision/onboard` API or admin UI)
- [ ] Configure org hierarchy: enterprise → district → centers
- [ ] Set center codes matching their internal naming
- [ ] Seed demo data (optional — gives them something to explore)
- [ ] Send login credentials securely
- [ ] Send the `PILOT_ONBOARDING_GUIDE.md`

**Operator side:**
- [ ] Designate internal champion
- [ ] Identify 2–3 locations for initial rollout
- [ ] Print center code cards for staff areas
- [ ] Brief safety coordinator / GM on what PackGuardian is

---

### Week 1: First Incident

**Milestone:** First real incident submitted by a field staff member

**Steps:**
1. Champion walks through mobile intake (15 minutes, in person or video)
2. Staff bookmark `/mobile` to phone home screens
3. First incident submitted — confirm it appears in Command Center
4. Champion assigns the case and creates one corrective action

**Common blockers:**
- "Staff don't know the center code" → Print and post codes at facility entrance
- "Voice doesn't work on their phone" → Android Chrome recommended for best experience
- "The app is slow" → Check WiFi connectivity; enable mobile data as fallback

---

### Week 2–3: Regular Reporting

**Milestone:** Incident reporting feels routine, not special

**Activities:**
- Run `./demo-reset.sh` is no longer needed — real data exists
- Champion is checking the Command Center weekly
- At least 2–3 cases have corrective actions
- At least 1 case has a comment from a supervisor

**Check-in agenda (30 minutes):**
1. Walk through all open cases together
2. Review any OSHA-flagged incidents
3. Identify what's confusing or missing
4. Demo one feature they haven't explored yet

---

### Month 1: Investigation Workflow

**Milestone:** Platform is used for end-to-end investigation, not just intake

**Activities:**
- Champion creates corrective actions for all recent cases
- OSHA tab reviewed for completeness on recordable incidents
- At least 1 case reaches "resolved" status with documentation

**Key metrics to review at month-end check-in:**
- How many incidents submitted?
- How many have corrective actions?
- What's the OSHA completeness rate?
- What's confusing or frustrating?

---

### Month 2: Intelligence Layer

**Milestone:** Operator uses pattern detection and executive briefing

**Activities:**
- Refresh safety signals: `POST /signals/refresh`
- Review center health panel with champion
- Show executive briefing to operator/owner
- Walk through any active safety signals and explain what they mean

---

### Month 3: ROI Assessment

**Milestone:** Operator can articulate clear value from the pilot

**Questions for the 90-day call:**
1. "Compared to before, how long does it take to document an incident now?"
2. "Has the platform surfaced any pattern or risk you weren't aware of?"
3. "How confident are you that your OSHA documentation is complete?"
4. "Would you recommend this to another pet care operator?"

---

## Section 3: Implementation Expectations

### What PackGuardian Does Automatically
- Creates a case when an incident is reported
- Determines OSHA recordability from treatment type + work restriction
- Populates Form 300 log entries
- Generates investigation brief for each case
- Detects safety patterns across locations
- Computes center health scores
- Sends in-app notifications to assigned users

### What Requires Human Action
- Reporting incidents (cannot be automated)
- Completing OSHA fields if not captured at intake
- Creating corrective actions and assigning owners
- Finalizing OSHA records at year-end
- Reviewing and acting on safety signals

### What We Do NOT Do (Currently)
- Send email notifications (notifications are in-app only)
- Store uploaded files permanently (evidence photo storage requires backend configuration)
- Integrate with HR systems or kennel management software
- Generate PDFs automatically (forms are screen-printable)

---

## Section 4: Support Expectations

| Type | Response Time |
|------|--------------|
| Critical bug (can't submit incident) | Same day, within 4 hours |
| Functional bug | Within 24 hours |
| Question / confusion | Within 24 hours |
| Feature request | Acknowledged within 48 hours; prioritized by month-end |
| Scheduled check-in | Weekly (optional), monthly (standard) |

**Contact:** jesse.boudreau.dev@gmail.com  
**For urgent issues:** Include "URGENT" in subject line

---

## Section 5: Operator Responsibilities

The operator is responsible for:
- Designating and maintaining an active internal champion
- Training their staff to use the mobile intake
- Ensuring incidents are reported promptly (within 24 hours of occurrence)
- Reviewing OSHA documentation for accuracy before finalization
- Using the platform for real operational incidents, not just tests

We cannot be responsible for:
- OSHA compliance — we provide tools, operators maintain compliance
- Workers' comp outcomes — we improve documentation, operators manage claims
- Staff adoption if the champion doesn't drive internal training

---

## Section 6: Feedback Cadence

| Cadence | Format | Purpose |
|---------|--------|---------|
| Weekly (optional) | 30-min video call | Blockers, quick wins |
| Monthly | 60-min structured call | Progress review, product input |
| Day 30 | Written check-in | First-month assessment |
| Day 90 | In-person or video | Pilot close, continuation decision |

Feedback we always want:
- "This confused me" — every confusion is a product problem
- "This took too long" — every slow path is a UX problem
- "I wish it could do X" — every missing feature is a roadmap input
- "This felt wrong" — every tone/language issue is a trust problem

---

## Section 7: Post-Pilot Transition

### If the Pilot Succeeds
1. Agree on pricing (standard rate after 50% pilot discount)
2. Transition from demo data to production data
3. Configure any missing features (email notifications, file storage)
4. Expand to remaining locations
5. Reference agreement (quote, case study, intro to other operators)

### If the Pilot Doesn't Work
1. Export operator's incident data in CSV format
2. Provide OSHA 300 log printout for their records
3. No further obligation on either side
4. Follow-up in 3–6 months to check on their situation

---

*PackGuardian — Phase 23 Pilot Launch Preparation*
