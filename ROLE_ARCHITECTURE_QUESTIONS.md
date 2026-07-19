# PackGuardian — Role Architecture Questions
*High-impact organizational decisions needed before production*

These questions have direct consequences on feature behavior, data access, and legal defensibility.
Each question is labeled with its impact tier.

---

## Q1 — What is a "confidential incident"? [CRITICAL]

**Impact:** Data model, access control, OSHA workflow, case visibility

Some incidents are sensitive by nature: allegations against leadership, workers comp disputes, EEOC complaints, harassment reports. These should not be visible to center managers or district directors.

**Decision needed:**
- Which incident types are automatically confidential?
- Who designates an incident confidential (submitter? safety director? HR only?)?
- Who can see confidential incidents? (HR, Legal, Owner only? Or also SF?)
- Can confidential incidents be made visible retroactively?

**Current state:** No confidentiality flag exists. All incidents with correct org scope are visible.

---

## Q2 — What is an HR-sensitive incident? [HIGH]

**Impact:** Case routing, OSHA visibility, HR workflow

HR-sensitive incidents (employee injuries, workplace conduct, return-to-work) need a different handling path than standard operational incidents (dog bite, equipment failure, escape).

**Decision needed:**
- Which incident types trigger HR-sensitive handling?
- Does HR-sensitive = auto-notify HR manager?
- Should HR-sensitive incidents bypass center manager entirely?
- Can a center manager mark an incident as HR-sensitive?

**Current state:** No HR-sensitive flag. HR users see all incidents filtered only by role.

---

## Q3 — Who can finalize an OSHA review? [CRITICAL — Legal Liability]

**Impact:** OSHA workflow, audit defensibility, compliance posture

Currently, the platform allows OSHA records to be finalized without a mandatory human review step. The AI suggests recordability but there is no enforced confirmation gate.

**Decision needed:**
- Which roles have finalization authority? (Safety Director? HR? Legal? Any combination?)
- Is there a quorum requirement? (e.g., HR + Safety must both confirm?)
- Can finalization be reversed? If so, by whom and with what audit trail?
- Should finalization create an immutable audit log entry?
- What happens when the AI recommendation conflicts with the reviewer's judgment?

**Current state:** Any admin or safety role can finalize. No human confirmation step enforced. AI recommendation shown but not gated.

---

## Q4 — Anonymous reporting policy [HIGH]

**Impact:** Mobile incident form, field staff trust, legal exposure

Field staff may be reluctant to report incidents if they know their name is attached. Anonymous reporting increases report volume and safety culture trust.

**Decision needed:**
- Do you want to offer anonymous incident submission?
- If yes: who can see the identity of an anonymous reporter? (No one? HR only? Safety Director?)
- Does anonymous status affect OSHA recordability determination?
- Can anonymous reports be associated with a specific center/location?

**Current state:** All incidents require authentication. The submitting user's identity is recorded.

---

## Q5 — Cross-district access for District Directors [MEDIUM]

**Impact:** Case visibility, incident scope, OSHA reporting

Currently, district directors can access all tenant data (the API does not enforce district-level scoping). This is a data model gap.

**Decision needed:**
- Should a district director be restricted to their district's incidents only?
- Should cross-district access require explicit authorization?
- Should district directors be able to see peer district data for benchmarking?

**Current state:** API filters by tenant_id but not by org assignment. All roles with the right system role can see all tenant data.

---

## Q6 — VP / President escalation authority [HIGH]

**Impact:** Escalation workflow, approval gates, executive reporting

Currently "Area Vice President" (`area_manager`) is the highest field leadership role. There is no VP or President org role.

**Decision needed:**
- Do you need VP and President as distinct roles above AVP?
- What does a President see differently than a VP?
- Should VP/President have emergency override authority (e.g., force-close a case over a safety director's objection)?
- Should VP/President receive proactive alerts rather than pulling dashboards?

**Current state:** `area_manager` is the highest field leadership tier. No VP/President distinction.

---

## Q7 — Escalation thresholds [MEDIUM]

**Impact:** Automation rules, case routing, alert behavior

The current escalation system moves cases through three review stages (Supervisor, Safety Director, Executive). The thresholds for auto-escalation are hardcoded.

**Decision needed:**
- What triggers Supervisor Review? (Time elapsed? Severity? Type?)
- What triggers Safety Director Review? (Days open? Risk score?)
- What triggers Executive Review? (Unresolved critical case? Legal hold?)
- Should escalation be automatic or require human promotion?
- Should field staff see that their report has been escalated?

**Current state:** Auto-escalation occurs based on risk score and days open. Thresholds are hardcoded in the automation engine.

---

## Q8 — Center Manager scope [MEDIUM]

**Impact:** Case visibility, incident filtering, org assignment

A center manager currently sees ALL tenant cases (the API does not filter by center assignment). This means a FL-MIA center manager can see NY-MAN incidents.

**Decision needed:**
- Should center managers be restricted to their assigned centers only?
- Should they be able to see cases involving their employees even at other centers?
- Should escalated cases remain visible after they move to a higher review stage?

**Current state:** API filters by tenant_id. Center assignment is not enforced server-side.

---

## Q9 — Workers comp integration [MEDIUM]

**Impact:** HR workflow, case management, legal exposure

Some incidents trigger workers comp claims. These have specific legal handling requirements.

**Decision needed:**
- Should PackGuardian track workers comp claim status?
- Who manages workers comp records? (HR only? Benefits?)
- Should claim status be visible in the case timeline?
- Should claim filing trigger automatic OSHA recordability review?

**Current state:** No workers comp tracking. HR and Benefits roles exist but have no distinct workflow.

---

## Q10 — Incident type taxonomy [LOW/MEDIUM]

**Impact:** Reporting, OSHA classification, signal detection

The current incident types are dog-facility-specific (dog_bite, escape, etc.). If the platform expands to other facility types, this taxonomy needs to evolve.

**Decision needed:**
- Is the current incident type list final?
- Should incident types be tenant-configurable?
- Should there be a "custom" incident type that field staff can define?
- Should incident types map to OSHA classifications automatically?

**Current state:** Incident types are hardcoded in the frontend form. Not tenant-configurable.

---

*PackGuardian — Role Architecture Questions — 2026-05-20*
*These questions require organizational decisions before implementation. Do not implement assumptions.*
