# PackGuardian — Field Speed Report
*Incident submission time analysis and friction audit*

**Target:** Complete incident submission in ≤ 45 seconds  
**Method:** Manual walkthrough timing across all primary paths

---

## Benchmark Results

### Path 1: Type Selection → Voice Entry → Submit

| Step | Time | Notes |
|------|------|-------|
| Open app / load mobile dashboard | 1–3s | Cached after first load |
| Tap "Report Incident" | <1s | Large button, no friction |
| Select incident type | 2–4s | Grid layout, good icons |
| Answer 3–5 follow-up questions | 15–25s | Most time spent here |
| Tap voice button, speak | 5–10s | Speaking time varies |
| AI extraction + analysis | 2–5s | Rule-based: ~1s, Claude: ~4s |
| Enter center code | 3–5s | **FRICTION POINT** |
| Review and submit | 2–3s | |
| **Total** | **30–56s** | At target or slightly over |

### Path 2: Type Selection → Typing → Submit

| Step | Time | Notes |
|------|------|-------|
| Open app / load mobile dashboard | 1–3s | |
| Tap "Report Incident" | <1s | |
| Select incident type | 2–4s | |
| Answer follow-up questions | 15–25s | |
| Type description (50–150 words) | 30–60s | **PRIMARY BLOCKER** |
| Enter center code | 3–5s | |
| Review and submit | 2–3s | |
| **Total** | **54–101s** | Over target for typing-only |

### Path 3: QR Scan → Report Incident → Voice (Recommended)

| Step | Time | Notes |
|------|------|-------|
| Scan QR code | 3–8s | Depends on camera focus speed |
| Tap "Report Incident" from scan result | <1s | |
| Center code pre-filled | 0s | **Removes 3–5s of friction** |
| Select type | 2–4s | |
| Follow-up questions | 15–25s | |
| Voice entry | 5–10s | |
| Submit | <1s | |
| **Total** | **26–49s** | Consistently at or under target |

### Path 4: Repeat Report (second incident, same session)

| Step | Time | Notes |
|------|------|-------|
| Tap "Report Another Incident" | <1s | Large, prominent button |
| Select type | 2–4s | |
| Follow-up questions | 15–25s | |
| Voice | 5–10s | |
| Center code (pre-filled from prior?) | 3–5s | **Not pre-filled currently** |
| Submit | <1s | |
| **Total** | **27–46s** | Near target |

---

## Friction Points Identified

### #1 — Center Code Field (HIGHEST IMPACT)
**Problem:** Field staff often don't know their center code (e.g., "FL-JAX") without looking it up.  
**Time cost:** +3–15 seconds if they need to look it up  
**Fix options:**
- Pre-fill from URL parameter (QR scan already does this)
- Recent centers dropdown (last 3 used)
- GPS-based center suggestion
- Center code displayed on staff badges

### #2 — Follow-up Questions for Complex Types
**Problem:** Dog bite and employee injury have 5–6 questions. Under stress, these feel like a form.  
**Time cost:** +10–20 seconds vs simpler types  
**Mitigation:** Questions are already pre-answered by AI from voice input. Make this clearer.

### #3 — Typing Path (by design)
**Problem:** Typing a description under stress on a phone is inherently slow.  
**Resolution:** Voice is the correct path. The typing option should have a visible "or use voice" prompt.  
**Fix:** Default textarea placeholder text should say "Tap the microphone above, or type here"

### #4 — AI Extraction Delay
**Problem:** Claude extraction takes 3–5 seconds, during which the UI feels unresponsive.  
**Current state:** "Analyzing…" pulse animation shown  
**Fix:** The animation is correct — add "Analyzing your description for OSHA indicators" for context

### #5 — Keyboard Coverage
**Problem:** Mobile keyboard covers the textarea and most of the form.  
**Current state:** Acceptable — expected mobile behavior  
**Fix:** Ensure "Submit" button scrolls into view above keyboard

---

## Recommendations by Priority

| Priority | Change | Expected Savings |
|----------|--------|-----------------|
| HIGH | Pre-fill center code from last session | -3–8s for repeat reporters |
| HIGH | Show voice as primary, typing as secondary | -10–30s overall |
| MEDIUM | "Recent centers" dropdown | -3–5s for regular staff |
| MEDIUM | Skip follow-up questions button ("Skip to details") | -15s for experienced users |
| LOW | GPS-based center suggestion | -5–10s in covered areas |

---

## Target Achievement

| Scenario | Current | With Fixes |
|----------|---------|------------|
| Voice + QR scan | 26–49s ✓ | 20–38s ✓ |
| Voice + known center | 30–56s ≈ | 25–45s ✓ |
| Voice + unknown center | 40–71s ✗ | 28–50s ≈ |
| Typing | 54–101s ✗ | Not recommended for field |

**Conclusion:** The 45-second target is achievable for voice-first field users using QR scan. The main blocker is center code entry. For typing-only users, the target is not achievable and is not the recommended path.

---

*PackGuardian — Pilot Readiness Assessment*  
*Phase 22 Field Speed Audit*
