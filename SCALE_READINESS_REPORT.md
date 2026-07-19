# PackGuardian — Scale Readiness Report
*What breaks at 100 centers and 10,000 incidents*

---

## Scope

This report models the platform's behavior at 10× current scale:
- 100 centers (vs 20 demo)
- 10,000 incidents (vs 49 demo)
- 500 corrective actions (vs ~50 demo)
- 50+ concurrent users (vs 2–3 demo)
- 1,000+ cases

Current state: all tests are analytical. No load testing infrastructure exists yet.

---

## Bottleneck 1: Center Health Score Computation

**Current implementation:**
`GET /command/center-health` loads ALL incidents for the tenant, then loops through all centers computing per-center aggregates in Python.

**At 49 incidents:** ~5ms. Not an issue.  
**At 10,000 incidents:** The full table scan + Python aggregation loop would take ~500ms–2s per request.  
**At 50 concurrent users all loading Command Center:** Could saturate the API in seconds.

**Fix:**
1. Add database indexes on `incidents.tenant_id`, `incidents.created_at`, `incidents.center_id` (likely already exist from `mapped_column(indexed=True)`)
2. Move aggregation to SQL: `SELECT center_id, COUNT(*), MAX(operational_risk_score) FROM incidents WHERE tenant_id=? AND created_at > NOW()-30days GROUP BY center_id`
3. Cache results in memory with 5-minute TTL
4. Effort: 1–2 days

**Risk for pilot:** LOW — pilot scale is 1–5 centers, ~200 incidents max.

---

## Bottleneck 2: Investigation Brief Recurrence Query

**Current implementation:**
`GET /cases/{id}/brief` runs `_extract_recurrence_patterns()` which queries all incidents for the tenant within a 90-day window, then does Python string matching for recurring elements.

**At 49 incidents:** ~80–120ms.  
**At 10,000 incidents:** Full table scan per case load → 2–5s per page load.

**Fix:**
1. Add SQL-level filtering: query only incidents at the same center within the time window
2. Cache brief results per case (invalidate on incident update)
3. Effort: 4 hours

**Risk for pilot:** LOW — pilot scale won't hit this.

---

## Bottleneck 3: Signal Detection

**Current implementation:**
`refresh_signals()` loads ALL incidents for the tenant, applies 4 detection algorithms in Python, then upserts signal records.

**At 49 incidents:** ~100–200ms. Triggered after each incident creation.  
**At 10,000 incidents:** ~5–10s per refresh. If triggered after every incident, the API would be unresponsive during high-volume periods.

**Fix:**
1. Move signal detection to a background task (Celery or FastAPI BackgroundTasks)
2. Rate-limit auto-refresh to once per 60 seconds per tenant
3. Add SQL-level date filtering (only look at incidents in the detection windows)
4. Effort: 1 day

**Risk for pilot:** MEDIUM — at 5 pilot locations with ~200 incidents, refresh takes ~500ms. Acceptable, but borderline.

---

## Bottleneck 4: WebSocket Load

**Current implementation:**
Single WebSocket server on the API process. Broadcasts events to all connected clients per tenant.

**At 2–3 concurrent users:** Fine.  
**At 50 concurrent users:** Each user holds an open WebSocket connection. FastAPI + uvicorn handles this well with async I/O.  
**At 500 concurrent users:** The single process will struggle. Need load balancing and Redis pub/sub for cross-process WS delivery.

**Risk for pilot:** NONE — pilot will have < 10 concurrent users.

---

## Bottleneck 5: Case List Rendering

**Current implementation:**
The Cases page fetches all cases and incidents for the tenant in two separate API calls, then joins them client-side.

**At 50 incidents:** < 100ms fetch, fast render.  
**At 10,000 incidents:** Fetching all incidents is impractical. The incident list response would be 5–15MB of JSON.

**Fix:**
1. Add pagination to `GET /incidents` (already partially done with ordering, but no limit/offset)
2. Add server-side case filtering (status, center, date range) instead of client-side
3. Effort: 1–2 days

**Risk for pilot:** LOW — pilot scale won't hit this, but a growing pilot (200+ incidents) will notice sluggishness by month 3.

---

## Bottleneck 6: OSHA Log Export

**Current implementation:**
`GET /incidents?recordable=true` returns all recordable incidents as a JSON array. The frontend renders them as a scrollable list.

**At 10,000 incidents:** Even a 300-record OSHA log (most are non-recordable) would be manageable. The bottleneck here is PDF generation — which doesn't exist yet.

**Risk for pilot:** NONE — pilot won't have enough recordable incidents for this to matter.

---

## Database Index Audit

The SQLAlchemy models use `mapped_column(..., index=True)` for tenant isolation. Verify the following indexes exist:

| Table | Column | Purpose |
|-------|--------|---------|
| incidents | tenant_id | All queries scope by tenant |
| incidents | created_at | Date range queries |
| incidents | center_id | Center-level aggregation |
| incidents | incident_type | Signal detection |
| incident_cases | tenant_id | All queries |
| incident_cases | assigned_to_user_id | My Cases filter |
| corrective_actions | tenant_id | All queries |
| corrective_actions | due_date | Overdue detection |
| safety_signals | tenant_id | All queries |
| safety_signals | is_active | Active signal filter |

**Verify with:**
```sql
SELECT indexname, tablename, indexdef FROM pg_indexes 
WHERE schemaname = 'public' ORDER BY tablename;
```

---

## Concurrent User Load Model

| Users | Expected behavior | Risk |
|-------|-----------------|------|
| 1–10 | Full performance | None |
| 10–50 | Slight DB contention on center health | Low |
| 50–100 | Center health and signal refresh become bottlenecks | Medium |
| 100+ | Requires query optimization + caching + background jobs | High |

**Pilot scale:** 5–25 users across a single operator. No scaling risk.  
**Growth scale:** 50–200 users across 3–5 operators. Bottlenecks 1 and 3 become real.  
**Enterprise scale:** 500+ users. Full rewrite of aggregation layer required.

---

## Rendering Bottlenecks (Frontend)

**Command Center:** Renders 4 metric cards, signal list, center health bars, timeline. At 20 centers, renders fast. At 100 centers, the center health panel renders 100 bars — could cause jank on slow devices.  
**Fix:** Paginate center health panel (show bottom 10, expand for more).

**Cases list:** Currently renders all cases. At 500 cases, the DOM will be large.  
**Fix:** Virtualize the list (react-window) or add server-side pagination.

---

## What Does NOT Need to Change for Pilot

- Authentication / session management
- WebSocket broadcast mechanism
- Signal detection algorithm accuracy
- OSHA recordability logic
- Audit trail implementation
- Mobile intake performance
- Investigation brief accuracy

These are architecturally sound. The bottlenecks above are all query performance and aggregation patterns — they're fixable incrementally without architectural changes.

---

## Recommended Scale Readiness Roadmap

| Timeline | Action | Priority |
|----------|--------|----------|
| Pre-pilot | None required | — |
| Month 1–2 | Monitor case list load time; add pagination if >100 incidents | MEDIUM |
| Month 3 | Cache center health scores (5-min TTL) | MEDIUM |
| Month 3 | Background task for signal refresh | MEDIUM |
| Post-pilot | Paginate incident queries | HIGH |
| Post-pilot | Add Redis for WebSocket pub/sub | LOW |
| Growth stage | SQL-level aggregation for center health | HIGH |

---

*PackGuardian — Phase 25 Pre-Pilot Hardening*
*Scale Readiness Report*
