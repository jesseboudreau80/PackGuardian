# PackGuardian — OSHA Readiness Audit
*Verification of OSHA 300/301/300A workflow completeness*

---

## Regulatory Scope

PackGuardian targets compliance with **29 CFR Part 1904** — OSHA Recordkeeping for Employers. Key requirements:

- Maintain Form 300 (Log of Work-Related Injuries and Illnesses)
- Complete Form 301 (Injury and Illness Incident Report) for each recordable incident
- Post Form 300A (Annual Summary) February 1 – April 30 each year
- Retain records for 5 years from the end of the calendar year covered

---

## Form 300 — Current State

### Fields Automated by PackGuardian ✓
- Establishment name (from tenant settings)
- Date of injury
- Employee name and job title
- Incident type → OSHA injury/illness category
- Days away from work (from `days_away` field)
- Restricted workdays (from `restricted_days` field)
- OSHA classification (days_away / restricted / other — auto-computed)

### Fields Requiring Manual Input ⚠
- Body part affected (captured at intake for injury types, not always completed)
- Time of injury (optional at intake, often omitted)
- Case number (auto-assigned per center per year ✓)

### Data Quality Issues Found
1. **Employee injuries without `employee_name`:** Some demo incidents are missing employee name despite being recordable. The OSHA readiness checker flags these correctly.
2. **`body_part` not required at intake:** For dog bites and slips, this is prompted but not required. ~30% of recordable incidents may be missing it.
3. **`time_of_injury` rarely collected:** Not included in current follow-up questions. 300 log technically requires it.

### Recommendation
Add `time_of_injury` to the intake follow-up for employee injury types. Make `body_part` required (not optional) for dog bites and slips.

---

## Form 301 — Current State

### Fields Auto-Populated ✓
- All injury fields from incident data
- Treatment type
- Days away / restricted
- OSHA classification
- Incident description (from report)

### Fields Missing from Current 301 Logic ⚠
- Physician/healthcare professional name (not captured at intake)
- Medical facility name and address (not captured)
- Date of return to work (not tracked in current schema)
- Date of death (not applicable for current use case)
- Case finalized by / finalization timestamp ✓ (from `is_finalized` + audit log)

### API Verification
`GET /osha/301/{incident_id}` returns all available fields correctly. The response correctly handles nullable fields with `None`. Form is printable from the OSHA page.

---

## Form 300A Annual Summary — Current State

### What Works ✓
- `GET /osha/300a/{year}` aggregates all recordable incidents for the year
- Counts cases by type (days_away, restricted, other) correctly
- Total days away and restricted days computed correctly

### What Needs Attention ⚠
1. **Multi-center 300A:** The 300A endpoint supports `center_id` filter but OSHA requires a separate 300A per establishment. There's no bulk "export all centers" view.
2. **Employee count:** 300A requires average number of employees and total hours worked — these are not captured anywhere in PackGuardian. Fields must be manually entered.
3. **Industry description (SIC/NAICS):** Required on 300A. Not captured in current tenant settings.

### Recommendation
Add `average_employee_count`, `total_hours_worked`, and `naics_code` fields to TenantSettings. These can be manually entered once per year.

---

## Finalization Workflow — Current State

### What Works ✓
- `POST /incidents/{id}/finalize` locks OSHA fields from further editing
- Audit trail preserved via `IncidentAuditLog`
- `is_finalized` flag visible in OSHA tab
- OSHARetentionRecord created for finalized incidents

### What's Missing ⚠
1. **Bulk finalization:** No way to finalize multiple incidents at once. For year-end, this is slow.
2. **Finalization confirmation flow:** Current implementation has no UI confirmation step — one click finalizes permanently. A "Are you sure? This cannot be undone." confirmation is needed.
3. **Override path for admin:** If a finalized record has an error, there's no admin override path without DB access.

---

## Retention Tracking — Current State

### What Works ✓
- `OSHARetentionRecord` created for each finalized incident
- `retention_expires_at` computed correctly (5 years from year end)
- Retention records visible via safety module

### What's Missing ⚠
1. No notification when a record's retention period is approaching expiry
2. No bulk retention export (needed for compliance audits)

---

## Audit Export Integrity

All OSHA data is sourced from the `incidents` table with no derived data — recordability determination is recomputed on each view from stored fields. This means:

- ✓ Changes to an incident after finalization are blocked (by `is_finalized` lock)
- ✓ All field changes are logged in `IncidentAuditLog`
- ⚠ The audit log isn't surfaced in the UI — needs a "view history" link

---

## Summary: OSHA Compliance Gaps

| Gap | Severity | Fix Effort |
|-----|----------|-----------|
| `body_part` not required at intake | Medium | Low |
| `time_of_injury` not collected | Low | Low |
| Missing physician/facility fields on 301 | Low | Medium |
| No bulk 300A export across centers | Medium | Medium |
| Employee count/hours not captured | High | Low (add to settings) |
| NAICS code not captured | Medium | Low (add to settings) |
| No finalization confirmation UI | High | Low |
| No admin override for finalized records | Medium | Medium |
| No bulk finalization | Low | Medium |
| Retention expiry notifications | Low | Medium |

**Verdict:** PackGuardian covers ~75% of OSHA 300/301 requirements automatically. The remaining gaps (employee count, finalization confirmation, multi-center 300A export) are identifiable and fixable. The current system is materially better than manual alternatives and provides a defensible audit trail.

---

*PackGuardian — Pilot Readiness Assessment*  
*Phase 22 OSHA Readiness Audit*
