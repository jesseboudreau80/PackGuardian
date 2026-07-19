# PackGuardian — Trust Language Audit
*Psychological audit of all visible wording for punitive, surveillance, or bureaucratic tone*

---

## The Standard

Every word in PackGuardian should pass this test:

**Would a kennel technician, upon reading this, feel supported — or watched?**

The goal is a system that field staff WANT to report into because it helps them, not one they avoid because it feels like evidence gathering against them.

---

## Current Language Audit

### ✓ Passing — Good Language

| Location | Current Text | Why It Works |
|----------|-------------|--------------|
| Mobile intake header | "What happened?" | Neutral, conversational |
| Follow-up questions | "Was the skin broken?" | Clinical but not accusatory |
| Voice button | "Tap to speak" | Inviting, low-stakes |
| Submit button | "Submit Report" | Neutral |
| Offline message | "Saved offline — will sync when connected" | Reassuring |
| Success screen | "What happens next" | Explains process, reduces anxiety |
| OSHA flag | "OSHA Review Recommended" | Informative, not alarming |
| Corrective action | "Ready to Verify" | Professional, not punitive |
| Investigation brief | "Recommended next step" | Assistive |

### ⚠ Needs Review — Potential Friction

| Location | Current Text | Issue | Recommended Change |
|----------|-------------|-------|-------------------|
| Corrective actions | "Follow-up needed" | "Needed" implies someone failed | "Follow-up scheduled" or "Action pending" |
| Case status | "Investigating" | Implies interrogation culture | "Under Review" |
| Risk score | "Risk 94/100 · critical" | "Critical" sounds alarming without context | "Risk Score: 94 · High Priority" |
| OSHA tab | "OSHA Documentation Incomplete" | "Incomplete" sounds like a failure | "OSHA Documentation In Progress" |
| Signals panel | "Pattern detected" | Vague, slightly ominous | "Operational pattern noted" |
| CA status | "Open" | Bureaucratic | "Active" |
| Empty escalations | "No active escalations" | Fine as-is | — |
| Brief header | "Contributing factors" | Could imply blame | "Risk factors" (already being used) |

### ✗ Needs Fixing — Punitive or Bureaucratic

| Location | Current Text | Problem | Fix |
|----------|-------------|---------|-----|
| Case list | "No cases found." | Abrupt, clinical | "No open investigations. All caught up!" |
| OSHA progress | "OSHA 60% complete" | "Complete" sounds like a report card | "OSHA review in progress" |
| CA empty state | "No corrective actions yet" | Fine | ✓ (already OK) |
| Overdue CA badge | "⚑ Follow-up needed" | Better than "OVERDUE" but still implies failure | "⚑ Follow-up due" |
| Comment field | "Add a comment…" | Fine | ✓ |
| Witness tab header | "0 statements collected" | "Collected" sounds like evidence gathering | "0 statements recorded" |
| Case status "new" | "New" | Too generic, implies unattended | "Just Reported" |

---

## Language Principles for PackGuardian

### Use This Language:

**Instead of "violation":** "safety observation" or "concern"  
**Instead of "overdue":** "follow-up due" or "action pending"  
**Instead of "failed":** "flagged for review" or "needs attention"  
**Instead of "recordable":** "OSHA review required"  
**Instead of "suspected":** "under review" or "being investigated"  
**Instead of "incident":** "event" is OK, but "incident" is standard — keep it  
**Instead of "escalation":** "elevated priority" or "district review" in some contexts  

### Avoid:
- Language that implies individual fault without stating it
- Military-style alert vocabulary (CRITICAL, ALERT, VIOLATION)
- Compliance-heavy framing that sounds like auditing employees
- Any wording that could make staff feel their privacy is compromised

### Tone Model:
Think of PackGuardian as a safety coordinator who is supportive and organized — not a compliance officer looking for problems.

---

## Priority Fixes

| Priority | Location | Current | Recommended |
|----------|----------|---------|-------------|
| HIGH | Case list empty state | "No cases found." | "No open cases. All clear for now." |
| HIGH | Case status "new" | "New" | "Just Reported" |
| MEDIUM | OSHA chip "incomplete" | "OSHA 60% complete" | "OSHA review in progress" |
| MEDIUM | Witness count | "0 statements collected" | "0 statements recorded" |
| MEDIUM | CA status "Open" | "Open" | "Active" |
| LOW | Overdue badge | "Follow-up needed" | "Follow-up due" |
| LOW | Risk band "critical" | "critical" (lowercase) | "high priority" |

---

*PackGuardian — Pilot Readiness Assessment*  
*Phase 22 Trust Language Audit*
