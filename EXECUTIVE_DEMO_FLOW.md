# PackGuardian — Executive Demo Flow
*10-minute walkthrough script optimized for investor and operator conversations*

---

## Pre-Demo Setup Checklist

```bash
# 1. Reset demo data (narrative scenarios active)
POST /provision/reset-demo

# 2. Backfill risk scores
POST /provision/backfill-risk-scores

# 3. Refresh signals (should produce 6 signals)
POST /signals/refresh

# 4. Verify signals count: 6
GET /signals

# 5. Have a phone ready for mobile demo
# 6. Open Command Center in browser tab 1
# 7. Open Cases in browser tab 2
# 8. Open Executive Briefing in browser tab 3
```

**Expected state:**
- 39 incidents across 20 locations
- 6 active safety signals (temporal cluster, repeat patterns, escalation)
- FL-JAX showing "Needs Attention" in center health
- GA-ATL Zeus case escalated to level 2
- Executive briefing showing incident trend

---

## The Hook (60 seconds)

**Opening question:** "How long would it take you right now to tell me which of your locations has had the most incidents this month — and what's been done about them?"

*Let them answer. Then:*

"We're going to show you that answer in under 30 seconds. And then we're going to show you a dog bite being reported from a phone in under 60 seconds."

---

## Scene 1: The Live Incident Report (2.5 minutes)

**Device:** Phone (or phone in browser mobile view)

**Navigate to:** `/mobile`

**Say:** "This is what your kennel staff sees. A dog just bit an employee during morning feeding."

**Action:** Tap "Report Incident" → tap "Dog Bite"

**Say:** "Five quick questions. No forms. This is faster than calling the manager."

**Action:** Answer questions: skin broken → Yes / who → Team member / treatment → Emergency room

**Show:** OSHA warning banner appears

**Say:** "The system just determined this is OSHA-recordable. Automatically. Without anyone looking up 29 CFR 1904."

**Action:** Tap voice button → speak: *"Golden retriever, kennel C-4, bit Tanya on the forearm during feeding. She's at urgent care now. Dog had no prior bite history in our system."*

**Show:** AI extraction runs, description analyzed

**Action:** Enter center code "FL-MIA" → Submit

**Say:** "Done. That took about 45 seconds. A case is now open. The safety director has been notified. And this is reflected in the Command Center — right now."

---

## Scene 2: Command Center — Operational Picture (2 minutes)

**Navigate to:** `/command` (desktop)

**Say:** "This is what the safety coordinator sees — across all 20 locations, real-time."

**Point to:** The 4 metric cards

**Say:** "Risk score, open cases, critical incidents, escalations. At a glance. No report needed."

**Point to:** Center Health panel

**Say:** "And here's where it gets powerful. Which locations need attention today? FL-JAX is showing 'Needs Attention' — three incidents in 7 days near the same floor drain."

**Point to:** Safety Signals panel

**Say:** "The system detected this pattern automatically. It's not just showing you incidents — it's showing you the story behind the incidents."

**Scroll to signals:** Show the 6 active signals

**Say:** "Six operational patterns active across the network. Repeat slip/fall pattern at FL-JAX. Equipment failure pattern at PA-PIT. An escalated dog aggression case at GA-ATL. These would have been invisible in a spreadsheet."

---

## Scene 3: The Investigation (2.5 minutes)

**Navigate to:** `/cases` → open the Zeus fight case (GA-ATL, escalated, critical)

**Say:** "Let's look at one of those escalated cases — the Zeus situation at GA-ATL."

**Show:** Investigation brief card at top

**Say:** "The platform generates an investigation brief automatically. What happened, where the risk score comes from, what's still open. No one had to write this."

**Click:** Risk factors dropdown

**Say:** "The risk score isn't a black box. You can see exactly why it's 89 — severity, OSHA exposure, escalation level, repeat incidents."

**Click:** Corrective Actions tab

**Say:** "Two corrective actions already created. One completed — Zeus suspended from group play. One in progress — liability documentation."

**Click:** Witnesses tab

**Say:** "The witness statement from the kennel attendant is here — already linked to the case, time-stamped."

**Show:** The witness statement content

**Say:** "This is the documentation trail that makes a workers' comp claim defensible. Or that prevents the next one."

---

## Scene 4: The Executive View (1.5 minutes)

**Navigate to:** `/executive`

**Say:** "For an owner or board-level conversation — this is the 30,000-foot view."

**Point to:** Week-over-week trend

**Say:** "Incident trend: down this week versus last. Risk bands: 2 critical, 4 high. 8 OSHA-recordable incidents on file."

**Point to:** OSHA compliance callout

**Say:** "3 pending finalization. That's your 300 log exposure. Those need to be closed."

**Point to:** Center health panel

**Say:** "Which locations need attention? FL-JAX, GA-ATL. Not a spreadsheet. Not a Monday morning email. Right here."

---

## The Close (30 seconds)

**Say:** "From a field report to a full investigation, corrective actions, OSHA documentation, and portfolio-level risk visibility — one system, built for how pet care actually works. Under 30 minutes to first incident report for a new location. Under $50 per location per month."

**Ask:** "What's the most recent incident you had that took more than a day to document?"

*Let them tell the story. Then:* "That's exactly what we built PackGuardian to prevent."

---

## Fallback: If Something Breaks

| Problem | Recovery |
|---------|----------|
| API down | Show screenshots from demo assets |
| No signals | `POST /signals/refresh` → should produce 6 |
| Demo data wrong | `POST /provision/reset-demo` → wait 30s |
| Mobile slow | Switch to desktop mobile view (Chrome DevTools) |
| Login fails | admin@packguardian.com / changeme |

---

## The "Wow" Moments (in order of impact)

1. **OSHA banner auto-appears** when emergency room is selected — instant proof of intelligence
2. **AI extracts from voice** — they see the description populate in real time  
3. **6 signals firing** — the pattern detection feels like magic when explained
4. **Investigation brief auto-generates** — no one wrote that summary; the system did
5. **Center health panel** — "which locations need attention" is instantly answered

---

*PackGuardian — Pilot Readiness Assessment*  
*Phase 22 Executive Demo Flow*
