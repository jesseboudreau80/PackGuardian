# PackGuardian — Pilot Success Metrics

**Definition:** A successful pilot is one where the operator adopts PackGuardian as their primary safety documentation system, understands its value clearly, and is willing to continue and refer others.

---

## Primary Success Criteria (90-day pilot)

### Criterion 1: Adoption — Minimum 10 Real Incidents Reported
**Why:** Proves the system works for actual field conditions, not just demos  
**Measurement:** Count of incidents created via field staff (not admin-created test data)  
**Target:** ≥10 real incidents during pilot period  
**How to verify:** Check `GET /incidents` and filter by dates after pilot start

### Criterion 2: OSHA Completeness Rate ≥ 70%
**Why:** Proves the platform improves documentation discipline  
**Measurement:** % of recordable incidents with all required OSHA fields complete  
**Target:** ≥70% by day 60 (vs estimated 30–50% baseline for manual process)  
**How to verify:** Count incidents where `recordable=true` and all required fields present

### Criterion 3: Corrective Action Follow-Through ≥ 60%
**Why:** Proves the platform changes operational behavior, not just documentation  
**Measurement:** % of corrective actions reaching "completed" status within their due date  
**Target:** ≥60% on-time completion  
**How to verify:** `GET /cases/{id}/corrective-actions` — filter by due_date and status

### Criterion 4: Internal Champion Active Weekly
**Why:** A passive pilot is not a successful pilot — someone must own it  
**Measurement:** Weekly login activity from the designated champion user  
**Target:** Champion logs in ≥4 times/week during the pilot  
**How to verify:** Audit log activity

### Criterion 5: Pilot Customer Reference Willingness
**Why:** The ultimate signal of value — they'll tell others  
**Measurement:** Yes/No at 90-day check-in  
**Target:** Yes (or qualified version: "willing to talk to similar operators")  
**How to verify:** Direct conversation

---

## Secondary Metrics (leading indicators)

### Mobile Adoption Rate
**Target:** ≥50% of incident reports submitted from mobile device  
**Why:** Desktop-only usage suggests office staff adoption without field buy-in  
**Benchmark concern:** If <30% mobile, field adoption is failing

### Time to First Corrective Action
**Target:** Corrective action created within 48 hours of incident report  
**Why:** Measures whether investigation workflow is being used, not just incident logging  
**Benchmark concern:** If >7 days, the case management flow isn't being adopted

### Signal Detection Engagement
**Target:** Signals reviewed and dismissed (not ignored) within 7 days  
**Why:** Proves operator is using intelligence layer, not just documentation  
**Measurement:** `GET /signals` — track dismissed count and time-to-dismiss

### QR Scan Usage
**Target:** At least 2 QR codes deployed and scanned  
**Why:** Proves field workflow integration, not just desk software  
**Measurement:** `GET /qr` + QR context endpoint call counts

### Investigation Depth Score (informal)
**Target:** At least 30% of cases have ≥2 of: witness statement, evidence file, corrective action  
**Why:** Proves platform drives full investigation, not just intake  
**Measurement:** Cross-reference cases with CAs, witnesses, and evidence

---

## Failure Indicators (trigger pilot review call)

| Signal | Threshold | Action |
|--------|-----------|--------|
| No incidents reported in 2 weeks | 0 incidents / 14 days | Check-in call — adoption barrier? |
| All reports from admin account only | 100% admin-sourced | Field adoption failing |
| No corrective actions created | 0 CAs after 30 days | Investigation workflow not adopted |
| OSHA completeness below 40% at day 60 | <40% complete | OSHA workflow education needed |
| Champion not logging in | <1 login/week | Internal ownership failing |

---

## Pilot Progress Cadence

### Week 1
- [ ] At least 3 incidents reported from field staff
- [ ] At least 1 case assigned with corrective action
- [ ] Champion has completed onboarding walkthrough

### Month 1 Check-in
- [ ] Incident count: ___
- [ ] OSHA completeness rate: ___%
- [ ] Mobile adoption rate: ___%
- [ ] Champion satisfaction (1-5): ___
- [ ] Primary friction identified: ___

### Month 2 Check-in
- [ ] Total incidents: ___
- [ ] Corrective action follow-through: ___%
- [ ] Pattern detection used? Yes/No
- [ ] Would recommend to similar operator? Yes/No/Maybe

### Day 90: Pilot Close
- [ ] All 5 primary criteria met?
- [ ] Reference willingness confirmed?
- [ ] Continuation decision?
- [ ] Testimonial or case study permission?

---

## Reporting to Investors/Advisors

Use these metrics in investor conversations:

- "X real incidents reported, Y% with complete OSHA documentation"
- "Z corrective actions tracked, W% completed on time"
- "Pattern detection surfaced [specific recurring issue] that was previously invisible"
- "Time to complete OSHA documentation: [X days] → [X hours]"

The goal: concrete operational improvement numbers, not "they like using it."

---

*PackGuardian — Pilot Program*  
*Phase 22 Success Metrics*
