# PackGuardian — Role-Based UX Audit
*Every major page reviewed from each operational perspective*

---

## The 5-Level Hierarchy

| Level | Role | System Key | Primary Scope |
|-------|------|-----------|---------------|
| 1 | Owner | `admin` | Full platform, all tenants |
| 2 | ELT (VP/President) | `area_manager` | Enterprise-wide |
| 3 | Legal / HR / Compliance | `legal`, `hr` | Cross-org, confidential access |
| 4 | Field Leadership | `district_manager`, `center_manager` | District / Center |
| 5 | Field Staff | `field_staff` | Personal reports only |

---

## Page-by-Page Audit

### `/` — Dashboard (Home)

| Role | Current State | Should Feel Like |
|------|--------------|-----------------|
| Owner/Admin | AdminManagerView — full quick actions, platform controls | ✅ Good. Strategic overview, clean. |
| Area VP | DistrictManagerView — area intelligence | ✅ Good. Breadth is appropriate. |
| Legal/HR | Was FieldStaffView — too simple, wrong context | ✅ FIXED → LegalHRView (OSHA queue, compliance metrics) |
| District Director | DistrictManagerView — district overview | ✅ Good. Command center feel. |
| Center Manager | CenterManagerView — center operations | ✅ Good. Operationally grounded. |
| Field Staff | Was FieldStaffView (over-complex, red alarms) | ✅ FIXED → Redesigned FieldStaffView (calm, simple, supportive) |

**Remaining gap:** No dedicated "Executive" (VP/President) view distinct from Area VP. Area VP gets DistrictManagerView which is tactical, not strategic. Consider `ExecutiveView` for VP/President.

---

### `/command` — Command Center

| Role | Should See | Currently |
|------|-----------|-----------|
| Owner | Everything | ✅ Visible |
| Area VP | Regional risk summary | ✅ Visible |
| Legal/HR | **Should NOT see** — compliance view is separate | Blocked by nav (show_command: false for legal/hr) |
| District Director | District events, escalations | ✅ Visible |
| Center Manager | **Should NOT see** — too much noise | Blocked by nav (show_command: false for center_manager) |
| Field Staff | **Must not see** | Blocked by nav |

**Status:** Correct. Command Center is gated to admin/district-and-above/operations.

---

### `/cases` — Case Management

| Role | Should See | Currently |
|------|-----------|-----------|
| Owner | All cases, full edit | ✅ Visible |
| Area VP | All cases in area | ✅ Visible |
| Legal/HR | Cases requiring review | ✅ Visible |
| District Director | District cases | ✅ Visible |
| Center Manager | Center cases only | ✅ Visible (filtered by assignment) |
| Field Staff | **Should NOT see** — wrong level of detail | ✅ FIXED → Hidden via nav (show_cases: false for field_staff) |

**Remaining gap:** No role-based filtering on the cases page itself — center manager sees all tenant cases if they type the URL directly. Backend `/cases` should scope by org membership.

---

### `/osha` — OSHA Review

| Role | Should See | Currently |
|------|-----------|-----------|
| Owner | Full OSHA log | ✅ Visible |
| Area VP | Enterprise OSHA summary | Visible |
| Legal/HR | **Primary workflow** — review queue | ✅ FIXED → Nav shows OSHA for legal |
| District Director | District OSHA summary | **Gap** — not in their nav |
| Center Manager | Center OSHA records | Blocked by nav |
| Field Staff | **Must not see** | ✅ Blocked |

**Remaining gap:** District Director should see OSHA for their district. Current nav only shows OSHA for admin/safety/hr/legal.

---

### `/safety` — Safety Intelligence

| Role | Should See | Currently |
|------|-----------|-----------|
| Owner | Full signal map | ✅ Visible |
| Area VP | Area risk signals | ✅ Visible |
| Legal/HR | **Can help** but not primary | Blocked by nav |
| District Director | District patterns | ✅ Visible |
| Center Manager | **Should NOT see** — too strategic | Blocked by nav |
| Field Staff | **Must not see** | ✅ Blocked |

**Status:** Acceptable. Safety intel is appropriately scoped.

---

### `/work` — Work Queue / My Shift

| Role | Should Feel Like | Currently |
|------|-----------------|-----------|
| Owner | Task overview, strategic | ✅ Works |
| Area VP | Cross-district follow-ups | ✅ Works |
| Legal/HR | Legal tasks, review queue | Works (generic) |
| District Director | District corrective actions | ✅ Works |
| Center Manager | Center tasks and follow-ups | ✅ Works |
| Field Staff | **My personal follow-ups** | ✅ Accessible via link |

**Status:** Good. The page is role-neutral which works since it's filtered by assignment.

---

### `/mobile` — Field Operations Hub

| Role | Should Feel Like | Currently |
|------|-----------------|-----------|
| Owner | Quick field access | ✅ Works |
| Field Staff | **Primary home** — calm, simple | ✅ "My Shift" renamed to "My Follow-Ups" in grid |
| Center Manager | Mobile incident reporting | ✅ Works |

**Status:** Mobile page is solid. The previous "My Work" label has been updated to "My Follow-Ups".

---

### `/mobile/incident` — Report Incident (Mobile)

**All roles:** Same form. This is correct — incident reporting is role-agnostic.

**Emotional audit:**
- ✅ Voice input, photo upload, AI extraction
- ✅ Offline queue for no-network situations
- ✅ Supportive success screen
- ⚠️ Form title "Report an Incident" is neutral — acceptable

---

### Navigation — Role-Aware Summary

| Nav Item | Owner | Area VP | Legal/HR | DD | CM | Staff |
|----------|-------|---------|----------|----|----|-------|
| Command | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Safety Intel | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| OSHA | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Cases | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Field Map | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Field Ops | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| My Shift/Hub | "My Shift" | "My Shift" | "My Shift" | "My Shift" | "My Shift" | "Safety Hub" |

---

## Emotional Tone Assessment

| Role | Target Feeling | Current State | Gap |
|------|---------------|--------------|-----|
| Owner | Calm, powerful, fully informed | OK | No owner-specific framing |
| Area VP | Strategic, exploratory | OK | Shares District Director view |
| Legal/HR | Structured, traceable, defensible | IMPROVED | LegalHRView now live |
| District Director | Command center, operationally clear | Good | Title labels now say "District Director" |
| Center Manager | Operational clarity, daily rhythm | Good | None |
| Field Staff | Supportive, simple, psychologically safe | IMPROVED | Redesigned FieldStaffView |

---

## Open Issues After This Session

1. **OSHA for District Director** — District Directors should see their district's OSHA records
2. **ExecutiveView** — VP/President needs strategic lens, not tactical district view
3. **Cases backend scoping** — `/cases` should filter by org membership server-side
4. **OSHA human review step** — AI should recommend, human should confirm (no auto-finalize)
5. **Legal role in nav** — Legal users currently see "Field Ops" in nav; may want "Compliance" instead

*PackGuardian — Role-Based UX Audit — 2026-05-20*
