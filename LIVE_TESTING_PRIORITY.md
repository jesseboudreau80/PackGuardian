# PackGuardian — Live Testing Priority
*Exactly what to test next, on each device and scenario*
*Generated: 2026-05-20*

---

## Before Testing: Prerequisites

1. Change the admin password (see GAP-C1 in KNOWN_PRODUCTION_GAPS.md — 5 minutes)
2. Move UPLOAD_DIR to persistent path (GAP-C2 — 10 minutes)
3. Run `./demo-reset.sh` to get fresh, known demo data
4. Open two browser tabs: desktop admin view + mobile view

---

## PRIORITY 1 — Security (Do First)

**Test: Can the default admin still log in?**
- Open a private/incognito browser
- Navigate to `https://packguardian.jesseboudreau.com/login`
- Try: `admin@packguardian.com` / `changeme`
- **Expected after fix:** Login fails with "Invalid email or password"
- **If it succeeds:** Stop testing and change the password first

---

## PRIORITY 2 — Desktop Workflows (Chrome, logged in as admin)

### 2A. Command Center integrity
- Log in → land on `/command`
- Verify: green "Connected" dot in header
- Verify: metric cards show real numbers (not zeros)
- Verify: "Cases Under Review" panel is present (not "Active Escalations")
- Verify: clicking "↻ Refresh" updates the "Updated X min ago" timestamp
- Click any case in "Cases Under Review" → should land on `/cases`

### 2B. Cases list — incident type display
- Navigate to `/cases`
- Verify: each case shows an incident type (e.g., "Dog Bite · FL-MIA") not a UUID fragment
- Verify: status filters work (select "New" → only new cases show)
- Verify: "Escalated only" checkbox filters to escalated cases
- Click a dog bite case → case detail opens on right

### 2C. Case detail — full workflow
- Open a high-priority case
- Verify: header shows "Dog Bite" as incident type (not UUID)
- Verify: Review Stage badge shows "Supervisor Review" or "Safety Director Review" (not "Level N")
- Change status → verify "Saving…" → "✓ Saved" feedback
- Change Review Stage → verify dropdown options are named stages, not "0–3"
- Click "Corrective Actions" tab → verify existing CAs are visible
- Click the circle button on an open CA → verify it marks complete
- Click "Evidence" tab → upload a test image → verify "AI" badge appears after processing
- Click the uploaded file → verify Preview modal opens and close works

### 2D. OSHA workflow
- Navigate to `/osha`
- Verify: Form 300 log shows recordable incidents (there should be ~5–8 from demo)
- Click a row → Form 301 detail expands inline
- Click the same row again → collapses (toggle works)
- **Critical check:** Clicking one row's detail and then another → only ONE Form 301 shows at a time
- Switch year to previous year → verify 0 incidents shown (not an error)

### 2E. Executive briefing
- Navigate to `/executive`
- Verify: subtitle says "Safety performance across all locations — last 30 days"
- Verify: KPI row shows total incidents, open cases, OSHA recordable, follow-up actions
- Verify: Incident trend badge shows "↑ N vs last week" or "↓ N"
- Verify: Risk distribution bars are present and non-zero
- Verify: CenterHealthPanel loads at bottom

### 2F. My Work
- Navigate to `/work`
- Verify: skeleton loading cards appear (not bare text)
- Verify: after load, escalated cases show named review stages (not "Level 2")
- Verify: "Follow-Up Needed" section shows overdue tasks

---

## PRIORITY 3 — Mobile (Android Chrome preferred, then iOS Safari)

### 3A. Navigation and layout
- Navigate to `https://packguardian.jesseboudreau.com/mobile`
- Verify: content starts immediately below the AppHeader (no dead space)
- Verify: bottom nav shows Shift / Report / Inspect / Scan
- Verify: stat cards load (My Cases, Follow-Up, Incidents, Inspections)
- Tap "My Work" button (previously "My Cases") → verify it goes to `/work`

### 3B. Incident report — keyboard/text input
- Tap "Report Incident" → "Slip / Fall" type
- Tap through follow-up questions (surface type, body part, treatment)
- Note: verify treatment selection auto-highlights correctly
- Details screen: type a short description (< 30 chars)
- Verify: "💡 A little more helps" hint appears
- Type more → verify hint disappears when > 50 chars
- Set center code (blank → observe "e.g. FL-MIA" placeholder)
- Submit → verify "Report Submitted" screen with "Your supervisor has been notified"
- On success screen: verify "Photos saved to the case file" does NOT appear (since no photos were added)

### 3C. Voice input (Chrome/Android only)
- Start a new incident → Select "Dog Bite" → Continue to Details
- Tap the large "🎤 Tap to speak" button
- Speak: "A dog bit a team member on the hand during feeding time. First aid was applied."
- Release button → wait 2–3 seconds
- Verify: AI analysis card appears with a summary
- Verify: "Follow-up needed" prompts appear beneath the AI card
- Verify: description text area is pre-filled with the transcript
- Submit → check the case in the desktop view → verify description is present

### 3D. Photo upload (critical test)
- Start a new incident → Select "Employee Injury"
- Tap through questions
- Add a test photo (tap "📷 Take or upload a photo")
- Submit
- Verify on success screen: "📷 Photos saved to the case file" appears
- Navigate to `/cases` on desktop → find the case → Evidence tab
- Verify: the photo appears in the evidence list
- **If photo is missing:** This confirms the race condition (GAP-H8) — document it

### 3E. Inspection flow
- Tap "Start Inspection" from mobile home
- Verify: Suspense wrapper works (no Next.js error)
- Tap "+ New" → select "Kennel" type → enter a center code → tap "Start"
- Step through checklist: mark some PASS, some FAIL
- Tap "Finish" → verify score appears
- Return to list → verify status shows "Passed" or "Failed" (not "passed" or "failed")

### 3F. QR scan
- Tap "Scan QR Code"
- Tap the big blue camera button → take a photo of a non-QR image
- Verify: "No QR code found in image" error appears
- Type a fake code in the manual entry box → tap "Look up"
- Verify: error says "not registered in your organization" (not "different tenant")

---

## PRIORITY 4 — Weak Network / Offline Testing

### 4A. Offline incident submission
- On mobile, enable Airplane mode
- Attempt to submit an incident report
- Verify: success screen says "Saved offline — will sync automatically when your connection is restored"
- Verify: "N queued" badge appears on Mobile shift home
- Re-enable WiFi
- Verify: "queued" badge disappears after sync

### 4B. Slow network — voice + upload
- If possible, throttle to "Slow 3G" in Chrome DevTools or use a mobile hotspot in a low-signal area
- Submit an incident with a photo
- Verify: "Submitting…" button state persists until complete (doesn't hang indefinitely)
- Verify: eventual success or error message (not a blank/frozen screen)

### 4C. Expired token behavior
- Log in on desktop
- Manually delete `pg_token` from localStorage (DevTools → Application → localStorage)
- Attempt to navigate to `/command`
- Verify: redirected to `/login?reason=session_expired` with the "Your session has expired" banner

---

## PRIORITY 5 — Executive Walkthrough (Simulated Demo)

Simulate a first-time executive seeing PackGuardian for 5 minutes.

1. Log in → Command Center
2. Read the safety signals (FL-JAX drain trap, etc.)
3. Click "Cases Under Review" → find a dog bite case
4. Open the case → click "Investigation Brief" → read the AI analysis
5. Click "OSHA" tab → verify "OSHA Review Required" badge and reason
6. Navigate to "Executive" in top nav
7. Look at KPI row → note trends
8. Look at Risk Distribution — can you explain what "elevated" means? (Test for operator confusion)
9. Navigate to "OSHA Reports" → look at Form 300 log
10. Rate how trustworthy this felt (1–10, honest)

**Known gaps to mention during demo:** No email notifications, files saved locally (not cloud), no PDF export

---

## Known Issues That Will Surface During Testing

| Test | Known issue | Expected behavior |
|------|-------------|------------------|
| Photo upload on iOS Safari | Voice input not available | Mic button shown but non-functional — should show fallback text instead |
| Voice input on iOS Safari | No SpeechRecognition API | Alert() is shown — needs a graceful fallback |
| Evidence tab after reboot | Files in /tmp wiped | Evidence tab shows files that can't download — "File data not found" 404 |
| Inspection center code | Doesn't persist | Must re-enter center code every inspection |
| Photo upload timing | Race condition | Occasional "Photos saved" shows but evidence tab empty |

---

*PackGuardian — Live Testing Priority List*
