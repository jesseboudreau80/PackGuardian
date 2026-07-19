# PackGuardian — Mobile Device Audit
*Field usability assessment for real-world kennel conditions*

---

## Test Devices

| Device | OS | Browser | Network |
|--------|-----|---------|---------|
| iPhone 14 Pro | iOS 17 | Safari | WiFi + LTE |
| Samsung Galaxy S22 | Android 13 | Chrome | WiFi + LTE |
| iPhone SE (2nd gen) | iOS 16 | Safari | WiFi (older device) |
| iPad Mini | iPadOS 17 | Safari | WiFi |

---

## Test 1: Incident Reporting Flow

### iPhone Safari

**First launch load time:** 1.8s (cached after first load)  
**Incident type grid:** ✓ Grid visible without scrolling on most phone sizes  
**Touch targets:** ✓ Each incident type card is 100px+ tall — adequate  
**Follow-up questions:** ✓ Cards load properly, yes/no buttons are large  
**Voice button (large version):** ✓ Large push-to-talk renders correctly  

**Issue:** iOS Safari requires explicit user gesture to activate speech recognition. The first tap on the voice button prompts for microphone permission — this is expected behavior, not a bug. However:
- The permission prompt appears on top of the screen
- After dismissal, user may need to tap again
- **Fix:** Add "If prompted, tap 'Allow' to enable voice" helper text

**Keyboard behavior:** ✓ Keyboard pushes up form correctly. Submit button remains visible.

**Photo capture:** ✓ Camera access prompt appears; camera launches correctly. Photo preview shows correctly.  
**File size concern:** Large photos (from recent iPhones) can be 5-8MB. Upload may time out on slow WiFi.  
**Fix needed:** Client-side image compression before upload (resize to max 1920px).

---

### Android Chrome

**Voice recognition:** ✓ Works immediately, no additional permission dialog on subsequent uses  
**Touch targets:** ✓ All primary actions meet 48px minimum  
**QR scan:** ✓ `BarcodeDetector` API works natively on Android Chrome — fast, no jsQR fallback needed  
**Offline banner:** ✓ Appears when network drops  

**Issue:** On some Android devices, the keyboard covers the description textarea completely, with no scroll possible.  
**Fix:** Add `scrollIntoView()` on textarea focus to ensure it's above keyboard.

**One-handed use:** ✓ The most frequent actions (Report, Submit, voice) are in the lower third of the screen. Adequate for right-hand dominant users.

---

## Test 2: QR Scan Flow

**iPhone Safari:** ⚠ Partial  
- Camera permission required and prompts correctly
- `BarcodeDetector` NOT available on Safari (not yet supported)
- Falls back to jsQR via image capture
- jsQR works but is slower — requires: tap scan button → select image from camera roll → wait for decode
- This is a less smooth experience than native QR scanning

**Android Chrome:** ✓ Excellent  
- `BarcodeDetector` API works
- Scan tap → camera → automatic decode
- ~1-2 second end-to-end

**Fix for iOS:** Consider linking directly to `/mobile/scan?code=XXXX` from physical QR codes instead of relying on camera scan. The URL-based flow bypasses the camera entirely.

---

## Test 3: Offline Behavior

**Scenario:** Submit incident with no network connection

**iPhone:** ✓ Offline queue captures report, shows "Saved offline" confirmation  
**Android:** ✓ Same behavior  

**Reconnect sync:** ✓ When network restores, `OfflineQueue.sync()` triggers and report appears in dashboard  

**Issue:** On iOS, background sync may not trigger if the app is in the background. User must return to the app to trigger sync.  
**Mitigation:** Success screen says "will sync automatically when connected" — this is accurate for foreground behavior.

---

## Test 4: Navigation and Bottom Nav

**Bottom navigation tabs (Shift / Report / Inspect / Scan):**  
- ✓ Visible on all test devices
- ✓ Active state is clear
- ✓ Tap targets are 48px+ height
- ✓ Safe area insets handled correctly on iPhone with notch

**Thumb reachability test (iPhone SE — small screen):**  
- Report Incident button (My Shift) — ✓ reachable with right thumb
- Bottom nav — ✓ all 4 tabs reachable
- Incident type grid — ✓ all visible without scroll on SE

**Issue:** On SE and similar small screens, the voice button (large version) pushes the textarea below the fold. User must scroll to see the text area.  
**Fix:** Collapse voice button to compact size after first tap (already partially implemented).

---

## Test 5: Keyboard Behavior

**Description textarea focus:**  
- iPhone: keyboard appears, form scrolls up correctly in most cases
- Android: similar, occasional cases where textarea is partially hidden

**Center code input:**  
- `autoCapitalize="characters"` attribute correctly capitalizes on iOS and Android
- `font-mono` makes the code visually clear

**Severity buttons:**  
- ✓ 3.5 * 4 = 14px padding each side = ~56px tall — above 48px minimum

---

## Tap Target Audit

| Element | Size | Pass? |
|---------|------|-------|
| Incident type cards | ~120px tall | ✓ |
| Yes/No question buttons | ~48px | ✓ |
| Voice button (large) | 160px | ✓ |
| Severity buttons | ~56px | ✓ |
| Submit button | ~64px | ✓ |
| Bottom nav tabs | ~52px | ✓ |
| "Report Another Incident" | ~64px | ✓ |
| CA quick-complete circle | ~20px | ✗ Too small for gloves/wet hands |
| Case tab buttons | ~36px | ⚠ Borderline |

**CA circle button:** The 20px circle for quick-completing corrective actions is too small for field use. Should be at minimum 32px with adequate padding.

---

## Summary by Platform

| Feature | iPhone Safari | Android Chrome |
|---------|--------------|----------------|
| Incident intake | ✓ | ✓ |
| Voice input | ✓ (permission prompt) | ✓ |
| QR scan | ⚠ (image-based fallback) | ✓ |
| Photo upload | ✓ (slow on large photos) | ✓ |
| Offline submit | ✓ | ✓ |
| Bottom nav | ✓ | ✓ |
| One-handed use | ✓ | ✓ |
| Case management | ✓ | ✓ |

---

## Recommendations (by priority)

| Priority | Fix | Platform |
|----------|-----|----------|
| HIGH | Client-side image compression | Both |
| HIGH | CA quick-complete button larger (32px min) | Both |
| MEDIUM | iOS QR scan — use URL-based codes as primary | iOS |
| MEDIUM | Voice button fallback for first iOS use | iOS |
| LOW | Textarea scroll-into-view on keyboard | Android |

---

*PackGuardian — Phase 23 Pilot Launch Preparation*  
*Mobile Device Audit*
