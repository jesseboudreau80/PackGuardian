# PackGuardian — Resilience Report
*Controlled failure testing and recovery analysis*

---

## Test Environment

**Platform:** PackGuardian Phase 22  
**API:** FastAPI + PostgreSQL  
**Web:** Next.js 15 App Router  
**Network:** Cloudflare tunnel (packguardian-api.jesseboudreau.com)

---

## Test 1: API Unavailable During Incident Submission

**Method:** Submit mobile incident while API is returning 503  
**Expected:** Offline queue captures the report, user sees "Saved offline" confirmation  

**Result:** ✓ PASS  
- `OfflineQueue` in `lib/offlineQueue.ts` correctly captures the payload
- User sees "Saved offline — will sync automatically when connected"
- Report syncs on reconnect when `OfflineQueue.sync(token)` is called

**Remaining gap:** Failed syncs are silently dropped if the token is expired. User should see "Sync failed — tap to retry."

---

## Test 2: Stale Auth Token

**Method:** Wait for JWT to expire (or modify expiry), then make API call  
**Expected:** User redirected to login with `from` parameter  

**Result:** ⚠ PARTIAL PASS  
- API correctly returns 401
- Frontend catches 401 via `axios.isAxiosError` in some components
- Command Center shows error message ✓
- Cases page shows error message ✓
- However: the auth redirect doesn't happen automatically — user must manually navigate to login

**Fix needed:** Global axios interceptor that catches 401 and redirects to `/login?from=current_path`. Currently implemented per-component.

---

## Test 3: Websocket Disconnection

**Method:** Kill websocket connection mid-session  
**Expected:** Indicator switches to "Polling" mode, data continues via 60s polling  

**Result:** ✓ PASS  
- WebSocket hook correctly detects disconnection
- UI switches from "Live" to "Polling" indicator
- Data continues to update via 60-second polling interval
- Reconnection happens automatically on next WebSocket event

---

## Test 4: Slow Network (Simulated 3G)

**Method:** Browser DevTools network throttle to "Slow 3G" (250kbps)  
**Expected:** Loading states visible, data appears when ready, no blank screens  

**Result:** ✓ PASS  
- Skeleton loading states appear correctly on Command Center, Center Health, Executive Briefing
- Cases list shows skeleton rows during load
- InvestigationBrief shows skeleton during brief fetch
- No blank white screens

**Remaining gap:** Image uploads have no progress indicator. On slow networks, upload appears to hang with no feedback.

---

## Test 5: Duplicate Submission

**Method:** Submit incident form twice rapidly (double-tap or re-submit)  
**Expected:** Incident created once; second submission blocked  

**Result:** ⚠ PARTIAL PASS  
- The submit button is disabled during submission (`disabled={submitting}`) ✓
- However: if user navigates away and returns, they could re-submit from cache
- No server-side idempotency key — a truly double request would create two incidents

**Fix needed:** Add client-side `submitting` state protection (✓ already done). Consider server-side deduplication by description hash + timestamp window.

---

## Test 6: Offline QR Scan

**Method:** Scan QR code while offline  
**Expected:** Graceful fallback, not a blank error  

**Result:** ⚠ PARTIAL PASS  
- Scan page shows a connection error when offline (not graceful)
- Should: show cached center information if previously loaded, or "Operating offline — use the incident type selector instead"
- Currently: the context lookup fails silently and falls back to basic lookup, which also fails

**Fix needed:** Add offline state detection to QR scan page with guided fallback.

---

## Test 7: Image Upload Failure

**Method:** Upload a photo in evidence tab while API is unavailable  
**Expected:** User sees upload failure with retry option  

**Result:** ⚠ PARTIAL PASS  
- Upload failure shows an error in the evidence tab ✓
- No retry button — user must re-select the file
- Large files (>5MB) timeout without clear indication

**Fix needed:** Add "Retry upload" button on failed evidence uploads.

---

## Test 8: Mobile Refresh Recovery

**Method:** Navigate away from mobile app then return (from background)  
**Expected:** Data refreshes, no stale state  

**Result:** ✓ PASS  
- `fetchShift()` is called on component mount
- WebSocket re-establishes on focus
- No stale state observed

---

## Test 9: Database Pressure (High Volume)

**Method:** N/A for pilot (demo data is 39 incidents max)  
**Status:** Not tested — not applicable at pilot scale  
**Note:** At 1000+ incidents, center health scoring may be slow (linear scan per center). Index on `center_id + created_at` would help.

---

## Resilience Summary

| Test | Result | Priority Fix |
|------|--------|-------------|
| API unavailable during submit | ✓ Pass | — |
| Stale auth token | ⚠ Partial | Global 401 interceptor |
| WebSocket disconnection | ✓ Pass | — |
| Slow network | ✓ Pass | Image upload progress |
| Duplicate submission | ⚠ Partial | Server-side dedup |
| Offline QR scan | ⚠ Partial | Offline fallback UI |
| Image upload failure | ⚠ Partial | Retry button |
| Mobile refresh recovery | ✓ Pass | — |

**Overall verdict:** The platform handles the most common field failure modes well (API down during submit, slow network, WebSocket dropout). Priority fixes are the auth redirect interceptor and image upload retry.

---

*PackGuardian — Pilot Readiness Assessment*  
*Phase 22 Resilience Report*
