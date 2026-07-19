# PackGuardian — Role Visibility Matrix
*Who sees what, who can edit what, who has approval authority*

---

## Role Key

| Code | Display Name | System Role | Org Role |
|------|-------------|------------|---------|
| OWN | Owner / Administrator | `admin` | — |
| AVP | Area Vice President | `manager` | `area_manager` |
| DD | District Director | `manager` | `district_manager` |
| CM | Center Manager | `manager` | `center_manager` |
| SF | Safety Director | `manager` | `safety` |
| HR | HR Manager | `manager` | `hr` |
| LC | Legal & Compliance | `manager` | `legal` |
| FS | Field Staff / Team Member | `manager` | none |

---

## Incident Visibility

| Access | OWN | AVP | DD | CM | SF | HR | LC | FS |
|--------|-----|-----|----|----|----|----|----|----|
| View all tenant incidents | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| View district incidents | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| View center incidents | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| View own submitted reports | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit new incident | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit incident record | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Delete incident | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View HR-sensitive incidents | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| View confidential incidents | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |

**NOTE:** HR-sensitive and confidential flags are aspirational — not yet implemented in the data model.

---

## Case Management

| Access | OWN | AVP | DD | CM | SF | HR | LC | FS |
|--------|-----|-----|----|----|----|----|----|----|
| View all cases | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create case | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Assign case | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Update case status | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Close case | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Escalate case | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| View case timeline | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Add case notes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Upload evidence | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (own case only) |
| Delete evidence | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## OSHA Review

| Access | OWN | AVP | DD | CM | SF | HR | LC | FS |
|--------|-----|-----|----|----|----|----|----|----|
| View OSHA log | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| View recordable incidents | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Mark incident recordable | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Finalize OSHA review | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Export 300/300A/301 | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Annual postings | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Audit search | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |

**OSHA Review Workflow Intent:**
- AI analyzes incident → **suggests** recordability (not finalizes)
- Human reviewer (Safety/HR/Legal) reviews suggestion with explanation
- Reviewer confirms or overrides → record is finalized with reviewer attribution
- This step is currently partially implemented — finalization exists but AI suggestion explainability is missing

---

## Safety Intelligence

| Access | OWN | AVP | DD | CM | SF | HR | LC | FS |
|--------|-----|-----|----|----|----|----|----|----|
| View signal dashboard | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Dismiss signals | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Refresh signal scan | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| View risk map | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| View executive summary | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## Corrective Actions

| Access | OWN | AVP | DD | CM | SF | HR | LC | FS |
|--------|-----|-----|----|----|----|----|----|----|
| View corrective actions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create corrective action | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Complete corrective action | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign corrective action | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## User & Org Management

| Access | OWN | AVP | DD | CM | SF | HR | LC | FS |
|--------|-----|-----|----|----|----|----|----|----|
| View users | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Invite users | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Deactivate users | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View org hierarchy | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit org structure | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Escalation / Approval Authority

| Action | Who Can Approve |
|--------|----------------|
| Supervisor Review (Level 1) | CM, DD, AVP, SF, OWN |
| Safety Director Review (Level 2) | DD, AVP, SF, OWN |
| Executive Review (Level 3) | AVP, OWN |
| OSHA Record Finalization | SF, HR, LC, OWN |
| Case Closure | CM, DD, AVP, SF, OWN |
| Corrective Action Completion | CM, DD, AVP, SF, OWN |

---

## Anonymous Reporting

*Policy not yet defined — see ROLE_ARCHITECTURE_QUESTIONS.md Q4.*

Current state: all incidents are associated with the submitting user account. There is no anonymous submission path.

---

## Confidential Incidents

*Definition not yet defined — see ROLE_ARCHITECTURE_QUESTIONS.md Q1.*

Current state: all incidents are visible to all users with appropriate role access. No confidentiality flag exists in the data model.

---

*PackGuardian — Role Visibility Matrix — 2026-05-20*
