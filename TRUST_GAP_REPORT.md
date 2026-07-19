# PackGuardian — Trust Gap Report
*"If you were a real operator facing OSHA exposure, would you trust this system?"*

---

## The Test

Would a real operator — a multi-location pet care owner with OSHA exposure, workers' comp risk, and accountability to their team — trust this platform with their operational data?

This report is the honest answer.

---

## What Trust Means Here

Trust is not "does the software work." It's:

1. **Data trust:** My records are accurate, complete, and won't be lost.
2. **Legal trust:** I can show this in an audit and it will hold up.
3. **Operational trust:** This tells me something real about my business, not something manufactured.
4. **Human trust:** This doesn't make my staff feel surveilled or punished.
5. **Reliability trust:** It works when I need it — including during an incident.

---

## Trust Category 1: Data Trust

### What earns trust:
- Every incident has a `created_at` timestamp and actor — they can see when it was filed and by whom
- Finalized records are locked — they can't be altered after sign-off
- `IncidentAuditLog` tracks changes before and after finalization
- The demo data feels operationally real — not sanitized

### What undermines trust:
- **Evidence photos may not persist** — if file storage isn't configured, photos disappear. This is the single biggest data trust risk. An operator who files an incident with a photo of an injury, only to find the photo gone a week later, will never trust the system again.
- **Sparse reports are stored as-is** — "Slip near washing station. No injury." is accurate but legally weak. The system doesn't warn that this is inadequate.
- **No report review step** — staff submit and move on. There's no "does this look right?" confirmation that includes key fields.

**Trust verdict: CONDITIONAL** — trustworthy if file storage is configured. Untrustworthy if it isn't.

---

## Trust Category 2: Legal Trust

### What earns trust:
- OSHA recordability determination is rule-based and explainable — not a black box
- Finalization creates a timestamp and actor record
- Before/after values now captured in the audit log for OSHA field changes (Phase 25 fix)
- Non-recordable incidents are correctly excluded from the 300 log
- The OSHA Inspection Simulation (Phase 24) confirms the system can answer a real inspection in < 5 minutes

### What undermines trust:
- **The "OSHA Auto-Determined" label is not visible in the UI** — when the system marks an incident as recordable, there's no clear "determined from: treatment_type = medical" explanation visible to the operator. The system just says "OSHA Recordable." The operator doesn't know why.
- **Finalization confirmation is missing** — an accidental click finalizes permanently. This erodes trust in the finalization process itself.
- **The 300A summary form doesn't exist as a printed artifact** — at year-end, operators need to post the 300A. The system doesn't generate this form in the correct format.

**Trust verdict: MOSTLY TRUSTWORTHY** — the audit trail is real. The gaps are in UX clarity and form completeness, not in data integrity.

---

## Trust Category 3: Operational Trust

### What earns trust:
- Pattern detection surfaces real problems (FL-JAX drain trap, Zeus recurrence) that operators wouldn't have noticed from individual incident reports
- Center health scoring gives a cross-location view that's genuinely novel for small operators
- Investigation brief synthesizes context that would otherwise require manual cross-referencing
- Risk scoring is explainable (contributing factors are visible)

### What undermines trust:
- **Signal false positives will erode trust** — if the platform flags a "temporal cluster" that turns out to be three unrelated minor incidents at the same location, and an executive investigates and finds nothing, they'll stop trusting the signals. Signal quality matters more than signal quantity.
- **Risk scores feel manufactured** — a score of "82/100" implies precision that doesn't exist. Operators may question whether 82 is meaningfully different from 78. The score needs a plain-English explanation of what it means operationally, not just "based on 7 contributing factors."
- **Center health scores are computed differently than expected** — the health scoring deducts for incidents, open CAs, and overdue CAs. Operators may expect it to also include things like: inspection scores, staff turnover, training completion. When they discover it doesn't include those, confidence drops.

**Trust verdict: PARTIALLY TRUSTWORTHY** — the patterns are real. The quantitative precision is overstated. The system should lean on narrative explanation rather than numerical scoring.

---

## Trust Category 4: Human Trust

### What earns trust:
- "Report Another Incident" is framed as empowering, not punitive
- The success screen explains what happens next — staff understand they're not in trouble
- Voice input removes the "writing a formal report" feeling
- "Follow-up needed" language (not "OVERDUE") reduces blame framing
- The OSHA tab feels like a professional compliance tool, not a gotcha

### What undermines trust:
- **"Escalation Level" language** — when staff see their case has been "escalated to level 2," they may fear disciplinary action. This is language from corporate complaint management, not from safety culture.
- **Investigation Brief feels like surveillance** — showing "Jane Smith has been involved in 3 incidents this year" next to "Animal Recurrence" signal feels accusatory to staff who might see it. The brief should focus on patterns and locations, not individuals.
- **Real names are visible everywhere** — employee names on the 300 log, on cases, on corrective actions. For a union environment or a state with strong worker privacy expectations, this visibility creates concern.

**Trust verdict: MOSTLY TRUSTWORTHY** — the platform's tone is supportive. The "escalation" language is the one term that needs to change. Employee name visibility is a policy question, not a platform bug.

---

## Trust Category 5: Reliability Trust

### What earns trust:
- The 401 interceptor redirects gracefully on token expiry — no mysterious blank screens
- The offline queue captures reports when the network drops — field staff get a confirmation
- The system health dot in the header (Phase 25 fix) shows connection status
- `./status.sh` gives the operator support contact an instant health snapshot
- Demo reset is documented and repeatable

### What undermines trust:
- **"Connection issue" in the header with no explanation** — when the header dot turns red, operators will panic. The red dot needs a tooltip: "Unable to reach the PackGuardian server. Your reports are saved locally and will sync when reconnected."
- **Slow loading with no feedback** — if the Command Center takes 3 seconds to load, there's no skeleton or loading indicator for some panels. This feels broken.
- **No retry indicator on failed uploads** — if a photo fails to upload, the user sees no error. The evidence tab looks empty. Users assume the photo was saved.

**Trust verdict: MOSTLY TRUSTWORTHY** — core reliability is solid. The gaps are in communicating failures gracefully, not in preventing them.

---

## The Honest Summary

**Would a real operator facing OSHA exposure trust this system?**

**Yes — with conditions:**

1. If file storage is configured and photos persist → **data trust established**
2. If the operator understands treatment type selection affects OSHA classification → **legal trust established**
3. If signals are accurate and not crying wolf → **operational trust established**
4. If staff are told "this is for documentation, not discipline" → **human trust established**
5. If the system is online when needed → **reliability trust established**

**Without condition 1 (file storage):** Do not launch. One lost photo destroys the platform's credibility.

**Without condition 4 (human framing):** Field adoption fails. Staff will underreport.

**All other conditions:** Manageable through training and communication during onboarding.

---

## Three Things That Would Immediately Increase Trust

1. **Add "Source: treatment_type = medical" to the OSHA recordability determination** — Make the logic transparent. Remove the mystery.

2. **Change "Escalation Level 2" to "Safety Director Review"** — Level numbers feel bureaucratic. Named review stages feel operational.

3. **Add "Your photo was saved" confirmation in the evidence tab** — Even if storage is just temporary, confirming receipt builds habit. The absence of confirmation creates fear.

---

## The Deeper Question

The platform earns trust not through features, but through honesty. It should say:
- "Here's what we know about this incident."
- "Here's what's still missing."
- "Here's why we think this pattern matters."
- "Here's what we recommend doing next."

Every place where the platform is vague, quantitative without explanation, or silent about its gaps — trust is lost. Every place where it's specific, transparent about limitations, and action-oriented — trust is built.

PackGuardian is mostly trustworthy. The gaps are specific, addressable, and known. That's the right place to be before a pilot.

---

*PackGuardian — Phase 25 Pre-Pilot Hardening*
*Trust Gap Report*
