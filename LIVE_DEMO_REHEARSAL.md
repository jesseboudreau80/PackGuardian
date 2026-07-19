# PackGuardian — Live Demo Rehearsal Guide
*Step-by-step rehearsal for the 15-minute executive walkthrough*

---

## Pre-Flight (5 minutes before)

```bash
./demo-reset.sh
```

Expected output: 39 incidents, 6 active signals, "Demo environment ready."

**Browser setup:**
- Tab 1: `/command` — Command Center
- Tab 2: `/executive` — Executive Briefing  
- Tab 3: `/cases` — Cases (pre-sorted, first case should be Zeus or FL-JAX arc)
- Phone: `/mobile` in mobile browser or Chrome DevTools device mode

**Verify before starting:**
- [ ] 6 signals active (visible in Command Center)
- [ ] Brooklyn Park Slope or Atlanta shows "critical" or "needs_attention" in center health
- [ ] Zeus case shows escalation level 2, critical priority
- [ ] FL-JAX shows 3 incidents in 30 days

---

## The Opening (60 seconds)

**Do NOT start with a feature tour.**

Start with: *"Let me show you what happened at your Florida location this week."*

Switch to the phone. Navigate to `/mobile`.

*"This is what your kennel staff sees. 7:43am on Tuesday morning — a dog bit a team member at FL-JAX. She opens this app."*

---

## Scene 1: Incident Report from Phone (90 seconds)

**Navigate:** `/mobile` → "Report Incident"

**Pacing:** Move deliberately. Don't rush.

**Action:** Tap "Dog Bite" → answer questions:
- Skin broken → Yes
- Who injured → Team member  
- Treatment → Emergency room

**Say:** *"Watch this."* [OSHA banner appears]

*"The system just determined this is OSHA-recordable. Automatically. No one looked up any regulation."*

**Action:** Tap the large microphone button → speak clearly:

> *"Golden retriever in kennel C-4 bit Tanya on the forearm during morning feeding. She went to urgent care. 8 stitches. Dog had no prior history in our system."*

**Wait for AI extraction.** [2-4 seconds]

*"It just analyzed that and extracted the key facts — injury location, body part, treatment type."*

**Action:** Type "FL-JAX" in center code → Submit

*"Done. 45 seconds. A case is open. The safety director is notified."*

---

## Scene 2: Command Center — The Portfolio View (2 minutes)

**Switch to Tab 1:** Command Center

*"Meanwhile, the safety director opens the Command Center."*

**Point to metrics row:**
*"At a glance: total incidents, open cases, critical count, average risk score. No report needed."*

**Point to Center Health panel:**
*"Which locations need attention? Brooklyn Park Slope — critical. Atlanta Midtown — needs attention. Right here. Not a Monday morning email."*

**Point to Safety Signals:**
*"Here's where it gets interesting. Six operational patterns the system detected automatically."*

**Read one signal aloud:** *"Incident burst — 3 incidents in 14 days at Jacksonville. Slip/fall pattern at the same location. This is the drain trap we just saw."*

*"These patterns would have been invisible in a spreadsheet."*

---

## Scene 3: Investigation Workspace (3 minutes)

**Switch to Tab 3:** Cases

**Navigate to:** Find the GA-ATL Zeus fight case (critical, escalated, L2)

*"Let me show you an escalated case — the Zeus situation at Atlanta."*

**The investigation brief appears.** Point to it:

*"PackGuardian generated this briefing automatically. Headline: critical dog fight. Risk score: 89. Contributing factors — shown, named, not a black box."*

**Click "Risk factors":**
*"Severity, OSHA exposure, escalation level, repeat incidents. You can see exactly why the score is 89."*

**Click Corrective Actions tab:**
*"Two corrective actions already created. Zeus suspended from group play — complete. Liability documentation in progress."*

**Click Witnesses tab:**
*"The witness statement from the kennel attendant is here. Time-stamped. Linked to the case. This is the documentation chain that makes a workers' comp claim defensible."*

**Show OSHA tab:**
*"The system shows exactly which OSHA fields are still needed. It tracks completeness so nothing gets missed."*

---

## Scene 4: Executive Briefing (90 seconds)

**Switch to Tab 2:** Executive Briefing

*"For a board conversation or ownership-level review:"*

**Point to week-over-week trend:**
*"Incident trend. Down this week versus last. Risk distribution — 2 critical, 4 high."*

**Point to OSHA callout:**
*"8 recordable incidents on file. 3 pending finalization. That's your regulatory exposure — visible, tracked, manageable."*

**Point to center health:**
*"Which locations need attention? Right here. Not a guess."*

---

## Scene 5: The QR Moment (45 seconds — optional, use if time permits)

**Switch to phone:** `/mobile/scan`

*"One more thing. Every kennel, play yard, and piece of equipment has a QR code."*

**Enter manually:** "FL-JAX"

*"Before a staff member starts their shift, they scan it. They see: 3 recent incidents, open corrective action, safety signal flagged. They know what to watch for before they walk in."*

---

## The Close (30 seconds)

*"From a field report to a full investigation — corrective actions, OSHA documentation, and cross-location risk visibility — in one system. Under 30 minutes to configure for a new location. Works offline in the kennel. Under $50 per location per month."*

**Pause.**

*"What's the most recent incident you had that took more than a day to document?"*

---

## Timing Guide

| Scene | Target | Hard Max |
|-------|--------|----------|
| Opening + incident report | 2:30 | 3:00 |
| Command Center | 2:00 | 2:30 |
| Investigation workspace | 3:00 | 4:00 |
| Executive briefing | 1:30 | 2:00 |
| QR moment (optional) | 0:45 | 1:00 |
| Close | 0:30 | 0:45 |
| **Total** | **10:15** | **13:15** |

---

## "Wow" Moments — Don't Rush Past These

1. **OSHA banner auto-appears** → let it land for 3 seconds
2. **AI extraction runs** → say "watch" before tapping stop
3. **Investigation brief appears** → scroll it slowly, let them read
4. **6 signals showing** → name one specifically, explain the story
5. **Center health "critical" label** → *"This is the answer to 'which location needs attention today'"*

---

## If Something Goes Wrong

| Problem | Recovery |
|---------|----------|
| API slow | Refresh. If 502, demo-reset.sh |
| Wrong case selected | Have case URL bookmarked with Zeus case ID |
| Voice doesn't work | Type the description — say "the voice mode works on your staff's phones" |
| Signal count is 1 | POST /signals/refresh in another tab silently |
| Screen is cluttered | Zoom browser to 90% before starting |
| Questions about HIPAA | "OSHA records are not HIPAA-covered — we can send documentation" |
| "What does it cost?" | "Under $50/location/month. For 10 locations, that's one cup of coffee per kennel per day." |

---

## The Ideal Opening Case

In the Cases list, look for:

1. **GA-ATL Zeus dog fight** — escalated L2, critical priority, has witnesses, CAs, OSHA flag
2. **FL-JAX drain incidents** — temporal cluster story, multiple CAs, repeat pattern visible

Open GA-ATL first (drama), then pivot to FL-JAX (pattern story).

---

*PackGuardian — Phase 23 Pilot Launch Preparation*
