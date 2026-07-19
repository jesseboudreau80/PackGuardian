# PackGuardian — Role Workflow Audit

**Purpose:** Simulate how each user persona interacts with the platform and identify friction, confusion, or gaps.

---

## Role 1: Kennel Technician (Field Staff)

**Context:** 22 years old, working a morning shift. A dog bit another dog in play yard B. She needs to report it.

### Simulated Workflow

1. Opens PackGuardian on her phone
2. Sees My Shift dashboard — recognizes "Report Incident" button immediately ✓
3. Taps dog bite option — clear icon, label is correct ✓
4. Answers 5 quick questions — all make sense for a dog fight ✓
5. Taps the microphone button — **[FRICTION]** button is not prominent enough on first view; most field staff would try to type first
6. Types description — keyboard covers most of the screen ✓ (expected)
7. Hits Submit — confirmation is clear ✓

### What Works
- Incident type selection is fast and visual
- Follow-up questions are logical and actionable
- Submit flow is simple
- Offline queuing is invisible (good)

### What Confuses
- Center code field: most technicians won't know their location code (e.g., "FL-MIA") without looking it up
- "Severity" label means little to someone without safety training; "How serious was this?" would be clearer
- The voice button in compact form ("Use Voice") is too small — should be a primary button always

### What Feels Punitive
- Nothing in the intake feels punitive ✓
- OSHA flag banner could feel scary: "This may require OSHA documentation" → soften to "Your supervisor will review this for documentation requirements"

### Improvement Recommendations
- Pre-populate center code from QR scan or URL parameter
- Rename "Severity" to "How serious was it?"
- Make voice button large by default (already improved in Phase 19)

---

## Role 2: Groomer

**Context:** Working alone in grooming bay. A dog snapped at her during nail trim. Minor scratch.

### Simulated Workflow

1. Opens mobile app from home screen bookmark
2. Selects "Grooming Incident" ✓
3. Answers questions about injury location, treatment needed ✓
4. Describes what happened — doesn't mention PPE or whether SDS was involved
5. AI asks about PPE in follow-up — **[GAP]** grooming incident questions don't include PPE prompt
6. Submits report

### What Works
- Fast intake, appropriate questions
- Correct OSHA determination (first aid only, not recordable)

### What Confuses
- "Body part" field appears for grooming incidents — irrelevant for animal-related scratches unless employee is injured
- Missing: photo prompt for animal behavior incidents (evidence of scratch wound)

### Improvement Recommendations
- Add "Were you wearing appropriate PPE?" to grooming incident follow-up
- Show photo prompt more prominently for injury incidents

---

## Role 3: General Manager (Center-Level)

**Context:** Receives notification that an incident was reported. Opens PackGuardian on laptop.

### Simulated Workflow

1. Logs in → sees Command Center ✓
2. Notification badge shows unread — clicks notification bell ✓
3. Navigates to Cases → finds the new case ✓
4. Opens investigation brief — immediately sees headline, risk score, and next step ✓
5. Assigns case to themselves ✓
6. Creates corrective action — form is clear ✓
7. Adds internal comment — visibility controls are confusing ("all" vs "management_only")

### What Works
- Command Center gives clear priority picture
- Investigation brief immediately explains the situation
- Case workflow is logical

### What Confuses
- Comment visibility labels: "Management Only" means different things to different operators
- The "Corrective Actions" tab is the 2nd tab — should it be the default for a GM?
- "Needs Verification" status in corrective actions isn't explained — what does verification mean?

### What Feels Slow
- Navigating to a specific center's incidents requires knowing to filter by center code
- No "my location's cases" view — a center GM has to filter manually

### Improvement Recommendations
- Default active tab in case detail could be role-aware (GM → Corrective Actions)
- Add "my center" filter preset for center managers
- Tooltip on "Ready to Verify" explaining what verification means

---

## Role 4: District Manager

**Context:** Overseeing 4 locations in Florida. Reviews weekly status each Monday morning.

### Simulated Workflow

1. Opens Command Center — sees escalated cases immediately ✓
2. Center Health panel shows FL-JAX at "Needs Attention" → clicks to drill down
3. **[GAP]** Clicking center health panel doesn't navigate to center-specific view
4. Navigates to Cases, filters by escalation_min=1 ✓
5. Reviews investigation briefs for escalated cases ✓
6. Wants to see all FL-JAX incidents — has to filter manually, no center shortcut

### What Works
- Executive metrics visible without drilling deep
- Escalation level colors are clear
- Safety signals show pattern information

### What Confuses
- No "district view" — DMs have to piece together their district's picture from filters
- Center health panel has no drill-down link
- Signal "2 escalated cases in 90 days" doesn't show which cases

### Improvement Recommendations
- Add drill-down from center health panel → center-filtered case list
- Add center_id as filter in case list URL params for bookmarkable views
- Show signal-linked incident IDs in the command center

---

## Role 5: Safety Director

**Context:** Responsible for OSHA compliance across all 20 locations.

### Simulated Workflow

1. Opens PackGuardian → goes directly to OSHA page ✓
2. Filters by current year → sees 8 recordable incidents ✓
3. Opens Form 300 log → correct entries present ✓
4. Clicks individual incident → 301 form populates ✓
5. Checks cases page → sees OSHA readiness chip on each case ✓
6. Finds 3 cases with "OSHA 60% complete" → clicks OSHA tab → sees exactly what's missing ✓
7. Navigates to incident to update missing fields — **[FRICTION]** OSHA tab in case doesn't link directly to the incident edit fields

### What Works
- OSHA readiness chip is immediately useful
- Form 300 generation is correct
- OshaReadiness panel shows exactly what's missing

### What Confuses
- OSHA tab shows "what's missing" but doesn't let you edit it from there
- "Finalized" incidents are locked — there's no clear path to override if something needs correction

### Improvement Recommendations
- Add "Edit in OSHA section" link from the case OSHA tab
- Add admin-level "unlock finalized incident" with audit trail
- Add bulk OSHA completeness view across all open cases

---

## Role 6: Executive (Owner/CEO)

**Context:** Multi-location owner reviewing portfolio status.

### Simulated Workflow

1. Opens Executive Briefing → immediately sees week-over-week trend ✓
2. Risk distribution chart — clear, shows critical incidents ✓
3. Center health panel — shows which locations need attention ✓
4. OSHA exposure summary — understands pending documentation risk ✓
5. **[DELIGHT MOMENT]** "7.7x ROI" conversation follows naturally from executive briefing
6. Wants to export or share the briefing — **[GAP]** no export/share function

### What Works
- Executive briefing is boardroom-ready
- Center health is immediately actionable
- Risk narrative is clear without jargon

### What's Missing
- PDF export of executive briefing
- Week-over-week trend for each center individually
- YTD comparison (this year vs last year)

---

## Summary: Critical Fixes Needed

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| HIGH | Center health panel has no drill-down | DM can't investigate from CC | Low |
| HIGH | Voice button too small for first-time users | Reduces field adoption | Low |
| MEDIUM | Comment visibility labels confusing | Creates user hesitation | Low |
| MEDIUM | OSHA tab links directly to edit | Safety director friction | Medium |
| MEDIUM | Center code not pre-filled on mobile | Adds 10-15 seconds to intake | Medium |
| LOW | No export from executive briefing | Sales limitation | Medium |
| LOW | No "my center" filter preset | GM productivity | Low |

---

*PackGuardian — Pilot Readiness Assessment*  
*Phase 22 Audit*
