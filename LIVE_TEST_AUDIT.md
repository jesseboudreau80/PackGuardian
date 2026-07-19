# PackGuardian — Live Test Audit
*Complete walkthrough of all desktop and mobile workflows*
*Session: Stabilization + Relaunch*

---

## Audit Coverage

| Area | Status |
|------|--------|
| Mobile incident intake | ✓ Audited |
| Mobile inspection flow | ✓ Audited |
| Mobile QR scan | ✓ Audited |
| Mobile shift dashboard | ✓ Audited |
| Command Center | ✓ Audited |
| Case management (desktop) | ✓ Audited |
| Investigation detail | ✓ Audited |
| Evidence uploads | ✓ Audited |
| OSHA reporting | ✓ Audited |
| Executive briefing | ✓ Audited |
| My Work (desktop) | ✓ Audited |
| Navigation / header | ✓ Audited |
| WebSocket behavior | ✓ Audited |

---

## CRITICAL Findings

### CRIT-01 — `inspect/page.tsx` missing Suspense wrapper (Next.js build error)
- **File**: `web/app/mobile/inspect/page.tsx`
- **What happens**: `useSearchParams()` is called directly in the default export component without a Suspense boundary. Next.js 13+ throws an error during build/SSR. The inspections route is broken in production.
- **Fix**: Extract inner component, wrap in `<Suspense>` at default export (same pattern as scan/page.tsx)

### CRIT-02 — Root layout applies `px-6 py-8` to mobile pages
- **File**: `web/app/layout.tsx`
- **What happens**: Mobile routes (/mobile/*) render inside `<main className="max-w-5xl mx-auto px-6 py-8">`. Mobile content gets squeezed by 24px horizontal padding and pushed down 32px from the header. The mobile layout is supposed to be edge-to-edge but is constrained by the desktop wrapper.
- **Fix**: Extract `<main>` into a client `MainWrapper` component that omits padding for mobile routes.

### CRIT-03 — OSHA table renders `<>` fragments without keys (React warning + rendering bug)
- **File**: `web/app/osha/page.tsx` line 159
- **What happens**: `.map()` returns a `<>...</>` fragment wrapping two `<tr>` elements. The fragment has no key, causing React reconciliation issues when rows expand/collapse. The Form 301 detail panel may flash to the wrong row.
- **Fix**: Use `<React.Fragment key={entry.incident_id}>` instead of `<>`.

---

## HIGH Findings

### HIGH-01 — `work/page.tsx` still says "Level N" for escalated cases
- **File**: `web/app/work/page.tsx` line 191
- **What happens**: Escalated Cases section shows "Level 2" — same human trust issue fixed in cases/page.tsx but missed here
- **Fix**: Replace with named stages: Supervisor Review / Safety Director Review / Executive Review

### HIGH-02 — `inspect/page.tsx` status badges show raw snake_case
- **File**: `web/app/mobile/inspect/page.tsx` line 252
- **What happens**: Inspection list shows "in_progress" instead of "In Progress" — looks like a broken label
- **Fix**: Add `STATUS_LABELS` map and use it

### HIGH-03 — QR scan error says "different tenant" — operator jargon
- **File**: `web/app/mobile/scan/page.tsx` line 96
- **What happens**: 404 on QR lookup shows: "It may belong to a different tenant." — operators don't know what "tenant" means, creates confusion and distrust
- **Fix**: "It may not be registered in your organization."

### HIGH-04 — Evidence tab uses browser `confirm()` for delete
- **File**: `web/app/components/EvidenceTab.tsx` line 149
- **What happens**: Browser confirm dialog blocks the page — on mobile it's jarring, can't be styled, and doesn't match the platform's design language. Also accidentally triggers on double-tap.
- **Fix**: Replace with inline confirmation state (first click shows "Confirm?" and a cancel, second click deletes)

### HIGH-05 — Mobile "My Cases" link goes to desktop cases page
- **File**: `web/app/mobile/page.tsx` line 159
- **What happens**: A mobile user tapping "My Cases" lands on `/cases` — the full desktop split-panel case management UI. On a 390px phone this is nearly unusable.
- **Fix**: Link to `/work` (My Work desktop page) which is the mobile-appropriate work queue, or keep as-is with an explicit note

### HIGH-06 — `work/page.tsx` loading state is bare text, no skeleton
- **File**: `web/app/work/page.tsx` line 142
- **What happens**: `"Loading your work queue…"` with no visual structure — looks broken vs. the Command Center's skeleton cards
- **Fix**: Add skeleton placeholder cards matching the 2×2 grid layout

---

## MEDIUM Findings

### MED-01 — Executive briefing subtitle is portfolio jargon
- **File**: `web/app/executive/page.tsx` line 105
- "30-day operational portfolio summary" → "Safety performance across all locations — last 30 days"

### MED-02 — CenterHealthPanel "escalated" language inconsistency
- **File**: `web/app/components/CenterHealthPanel.tsx` line 143
- Shows "⬆ N escalated" — now inconsistent with renamed "Review Stage" language elsewhere
- Fix: "⬆ N under review"

### MED-03 — `inspect/page.tsx` doesn't remember last center code
- Unlike the incident form which has localStorage pre-fill for center codes, the inspection form resets every time
- Minor friction but inconsistent

### MED-04 — AppHeader desktop nav visible on mobile viewport
- The nav links (Command, Executive, Cases, OSHA etc.) overflow-x scroll on mobile but aren't hidden
- On a phone, users see a horizontal-scrollable desktop nav above the mobile content
- Fix: Consider hiding nav on /mobile routes or reducing to just the logo/auth on mobile

### MED-05 — Command Center "Unprocessed Events" metric unexplained
- `web/app/command/page.tsx` line 204
- Shows "Unprocessed Events: 4" with no explanation of what these are or what to do
- Operators don't understand automation events — this number causes anxiety with no actionable response
- Fix: Rename to "System Events" or hide it from the main metric row (move to a less prominent spot)

### MED-06 — `work/page.tsx` assigned cases link to /cases but don't scroll to specific case
- Clicking an assigned case takes you to the top of the cases list — not to the specific case
- Minor but creates friction for supervisors with many open cases

### MED-07 — Evidence delete `✕` button is too small on mobile
- `EvidenceTab.tsx` line 254
- The delete `✕` is `text-xs` — approximately 12px — easy to accidentally tap
- Already covered by HIGH-04 (inline confirm), but the button itself needs a larger tap target

---

## POLISH Findings

### POL-01 — Inspect page "Finish" button is understated
- `inspect/page.tsx` line 122-124
- The primary action to complete an inspection is a small `text-xs` button in the header — easy to miss
- Should be more prominent (separate from the header row, or larger)

### POL-02 — OSHA Form 301 "Incident ID" label shows raw UUID
- `osha/page.tsx` line 223
- `["Incident ID", form.incident_id]` — shows a full UUID in the detail panel
- Could show a truncated ID or case number instead

### POL-03 — `work/page.tsx` escalated cases show "Level N" (trust language)
- Same as HIGH-01 — already flagged for fix

### POL-04 — Mobile "Report Incident" button on shift dashboard is red with "⚠️"
- `mobile/page.tsx` line 144-147
- Red background + warning emoji may feel alarming to staff who just want to file a routine report
- Consider toning down for non-emergency reports (the high-severity feel may cause avoidance)

### POL-05 — Evidence tab upload zone text says "Max 100 MB"
- `EvidenceTab.tsx` line 187
- The backend limit is actually set by `MAX_FILE_BYTES` in models — saying "100 MB" may be inaccurate
- Worth verifying against the actual limit

### POL-06 — Mobile inspect success score is visually strong but no next action is shown
- `inspect/page.tsx` lines 142-151
- After completing an inspection, the score shows (e.g., "72/100") but there's no "What now?" guidance
- If a case was auto-created (score < threshold), the text "Corrective case created" appears but there's no link to it

---

## Fixes Implemented

| ID | Fix | File(s) | Status |
|----|-----|---------|--------|
| CRIT-01 | Add Suspense wrapper to inspect/page.tsx | `mobile/inspect/page.tsx` | ✓ Fixed |
| CRIT-02 | MainWrapper removes padding for /mobile routes | `layout.tsx`, new `MainWrapper.tsx` | ✓ Fixed |
| CRIT-03 | OSHA fragment keys | `osha/page.tsx` | ✓ Fixed |
| HIGH-01 | work/page.tsx escalation language | `work/page.tsx` | ✓ Fixed |
| HIGH-02 | inspect status badge snake_case | `mobile/inspect/page.tsx` | ✓ Fixed |
| HIGH-03 | QR scan "tenant" error | `mobile/scan/page.tsx` | ✓ Fixed |
| HIGH-04 | Evidence delete inline confirm | `EvidenceTab.tsx` | ✓ Fixed |
| HIGH-05 | Mobile My Cases → desktop | `mobile/page.tsx` | ✓ Fixed |
| HIGH-06 | work/page.tsx skeleton loading | `work/page.tsx` | ✓ Fixed |
| MED-01 | Executive subtitle jargon | `executive/page.tsx` | ✓ Fixed |
| MED-02 | CenterHealthPanel "escalated" language | `CenterHealthPanel.tsx` | ✓ Fixed |
| MED-05 | Command Center "Unprocessed Events" label | `command/page.tsx` | ✓ Fixed |

---

## Still Open / Not Fixed This Pass

| ID | Issue | Why Not Fixed |
|----|-------|--------------|
| MED-03 | inspect doesn't remember center code | Low friction — can address in next pass |
| MED-04 | Desktop nav on mobile viewport | Requires layout restructure — defer |
| MED-06 | work/page cases don't link to specific case | Requires URL state — defer |
| POL-01 | Inspect "Finish" button too small | Polish-only — defer |
| POL-02 | OSHA Form 301 shows raw UUID | Polish-only — defer |
| POL-04 | Mobile report button red/alarming | Product decision — flag for discussion |
| POL-05 | Evidence max size text accuracy | Needs backend check |
| POL-06 | No post-inspection guidance | Future enhancement |

---

*PackGuardian — Stabilization + Relaunch*
*Live Test Audit*
