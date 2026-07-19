# PackGuardian — Field Adoption Test
*A tired kennel tech at end of shift — what breaks*

---

## The Scenario

Jordan, a kennel technician, is 8 hours into a closing shift at NY-BRK. It's 9:30pm. A dog fight happened at 8:45pm. Jordan is tired, the other staff member is still cleaning up, and the facility manager asked Jordan to "file the incident report before you go."

Jordan has an Android phone. Battery: 23%. Network: facility WiFi (spotty near the outdoor runs). Hands: damp from mopping.

This simulation identifies where the mobile intake breaks down under real conditions.

---

## Step 1: Navigating to the App

**What Jordan does:** Opens Chrome browser, doesn't know the URL, types "packguardian" in the search bar, clicks the wrong result.

**Failure point:** Jordan doesn't have the app bookmarked.  
**Current state:** The app has a bottom nav with "Scan" tab that includes QR onboarding panel. But Jordan doesn't know the URL to get there.  
**Fix:** The facility QR code (if posted) routes to the mobile page directly. If no QR code is posted, Jordan may not know how to reach the intake form.  
**Severity:** HIGH — this is the friction that causes "I'll do it tomorrow."

**Mitigation:** During onboarding week, have champion walk Jordan through: open Chrome → bookmark `/mobile` to home screen. Without that step, this breaks.

---

## Step 2: Opening the Incident Report Form

Jordan reaches `/mobile`, sees the My Shift dashboard. Taps "Report Incident."

**What Jordan sees:** The incident type grid — 12 icons in a 2-column layout.  
**What Jordan does:** Squints at the small icon labels. Taps "Dog Fight."  
**Friction:** Grid is visible without scrolling ✓. Icons large enough with damp hands ✓.  
**Issue:** Jordan accidentally taps "Aggressive Behavior" instead of "Dog Fight" — they look similar.  
**Impact:** Wrong incident type selected. Jordan doesn't notice.

**Severity:** MEDIUM — type can be corrected by the investigator later; it's a data quality issue, not a workflow blocker.

---

## Step 3: Follow-Up Questions

Jordan sees 4 follow-up questions for dog_fight:
- "Were any injuries sustained?" → Jordan taps Yes
- "Who was injured?" → Jordan taps "Dog only"
- "Was veterinary attention required?" → Jordan taps Yes
- "Were both dogs separated immediately?" → Jordan taps Yes

**What Jordan does:** Taps through quickly. Doesn't read the subtext.  
**Friction:** Buttons are large enough ✓. One tap per question ✓.  
**Issue:** Jordan taps "No" on the isolation question accidentally and doesn't re-read it.  
**Impact:** Minor — report says dogs were not separated, which is incorrect.

**Severity:** LOW — quick-question errors are expected; the description field catches the real story.

---

## Step 4: Details — Center Code

Details screen appears. Center code field shows "NY-BRK" pre-filled from last session.

**What Jordan does:** Glances at it, leaves it. It's correct.  
**What happens if it wasn't pre-filled:** Jordan doesn't know the center code. Leaves field blank. Report filed under "unknown."

**Status:** Pre-fill (Phase 24 fix) works here ✓. This is the single most important field improvement.

---

## Step 5: Voice Input

Jordan sees the large push-to-talk button.

**What Jordan does:** Taps it. A microphone permission dialog appears (first time on Chrome). Jordan taps "Allow."

**Second attempt:** Jordan holds the button and speaks:

> *"So there was a dog fight in play yard B. Two dogs. Um, the — the bigger one, I think it was a pit bull, started it. The other one got a bite on the leg. We separated them, both dogs are okay, owner's been notified."*

**What happens:** Speech Recognition captures the transcript. Slight distortion from background noise (barking in distance). The transcript shows correctly.

**AI extraction runs:** Correctly identifies `dog_fight`, extracts severity as `high`. Follow-up prompt: "Was veterinary evaluation arranged?"

**What Jordan does:** Glances at the transcript, doesn't edit it. Taps "Continue."

**Issue:** Jordan's description is 185 characters — good length. But "the bigger one" is not captured as a breed or dog name. Pattern detection can't flag this dog.  
**Severity:** MEDIUM — this is the real-world data quality problem; not a platform failure.

---

## Step 6: Description Quality Prompt

Description is 185 characters — above the 50-character threshold. No quality prompt shown.

**This is correct behavior.** The prompt only appears for < 50 chars. Jordan's voice report is adequate.

---

## Step 7: Photo

Jordan sees the photo button. Jordan decides not to take a photo — tired, hands wet, it's 9:35pm.

**What happens:** Report is submitted without photo evidence.  
**Impact:** Investigator has no visual evidence of the scene.  
**Severity:** LOW — photos are optional; description is sufficient for the case.

---

## Step 8: Submit

Jordan taps "Submit Report." Button says "Submitting…" for 1.5 seconds. Success screen appears.

**What Jordan sees:**
- Large green circle with checkmark
- "Report Submitted"
- "A case has been created and the investigation is open. Your supervisor has been notified."
- "What happens next" 4-step panel (collapsible)
- "⚠️ Report Another Incident" (primary CTA, red)
- "Return to Dashboard" (secondary)

**What Jordan does:** Reads "supervisor has been notified." Assumes the job is done. Taps "Return to Dashboard."

**What Jordan does NOT do:** Review the submitted report. Correct the "Aggressive Behavior" type error. Add more detail.

**Severity:** MEDIUM — expected behavior. Supervisors should review incoming reports and correct errors.

---

## Step 9: What the Supervisor Sees (5 Minutes Later)

The case appears in Command Center. Incident type: `aggressive_behavior` (wrong). Description: voice transcript from Jordan.

**What the supervisor sees:**
- "Aggressive Behavior at NY-BRK" — doesn't look urgent
- Description mentions "dog fight" — contradicts the type
- No photo
- "Dog only" injured — no OSHA recordability flag

**Issue:** The wrong incident type makes the case appear less severe. The supervisor may not escalate appropriately.

**Fix:** During training, tell supervisors to read the description, not just the type badge. Type can be corrected in case detail.

---

## Full Friction Inventory

| Step | Issue | Severity | Fix |
|------|-------|----------|-----|
| Navigation | No bookmark on home screen | HIGH | Onboarding: "Bookmark this" as step 1 |
| Type selection | Accidental tap on similar type | MEDIUM | Accept; correct in case detail |
| Follow-up | Inattentive tapping | LOW | Accept; expected field behavior |
| Center code | Empty if no prior session | HIGH | QR scan pre-fill; localStorage (done) |
| Voice | "The bigger one" not identified | MEDIUM | Cannot fix; describe limitations in onboarding |
| Photo | Skipped when tired | LOW | Accept; optional |
| Report correction | Jordan doesn't review before submit | MEDIUM | Add "Review before submit" step? |
| Supervisor | Wrong type creates triage confusion | MEDIUM | Training: read description, not just type |

---

## What Felt Good

1. **Center code pre-fill worked.** This is the single most impactful change for field adoption.
2. **Voice input worked under noise.** Adequate transcript despite background barking.
3. **Submit was fast.** Under 2 seconds — Jordan's battery didn't die.
4. **Success screen was clear.** "Your supervisor has been notified" set appropriate expectations.
5. **Push-to-talk is prominent.** Jordan found it without prompting.

---

## What Tired, Damp-Handed Staff Will Always Skip

1. Reviewing the transcript for accuracy
2. Correcting the incident type
3. Adding a photo
4. Reading the "What happens next" explanation
5. Verifying the center code

Design the system knowing these 5 things will not happen reliably. The platform must still produce useful investigations from incomplete inputs.

---

## Bottom Line

A tired kennel tech at 9:30pm can successfully submit an incident report in under 3 minutes if:
1. The app is bookmarked (or accessible via QR)
2. The center code is pre-filled

Without those two things, the friction is high enough that the report is postponed to tomorrow — or never filed.

Everything else is fixable in post-processing by a supervisor. The intake just needs to capture the minimum: something happened, somewhere, at some point. The rest can be filled in.

---

*PackGuardian — Phase 25 Pre-Pilot Hardening*
*Field Adoption Test*
