# PackGuardian — Production Hardening Report
*Infrastructure and code readiness assessment for pilot deployment*

---

## Current Deployment Architecture

```
Internet → Cloudflare Tunnel → reselleros (host)
                                    ├── API (port 8105) — uvicorn, FastAPI, SQLAlchemy
                                    └── Web (port 3005) — Next.js static + SSR
```

**Database:** PostgreSQL (local to host)  
**Process management:** `start.sh` / `stop.sh` (nohup + disown)  
**Log location:** `.logs/api.log`, `.logs/web.log`

---

## Assessment by Category

### 1. Startup Reliability — ACCEPTABLE

**Current:** `start.sh` starts API, waits 15s for health check, then starts web.  
**Risk:** If API health check fails, web doesn't start. Good protective behavior.  
**Gap:** No automatic restart on crash (no supervisor, no systemd, no PM2).  
**Recommendation for pilot:** Add `process.on('exit')` handler or a simple watchdog cron.

### 2. Structured Logging — ACCEPTABLE

**Current:** Python logging to `.logs/api.log`. Format: `timestamp level logger: message`.  
**Gap:** No JSON structured logging. Log rotation not configured — log file grows indefinitely.  
**Recommendation:** Add `RotatingFileHandler` with 50MB max size and 5 backup files.

### 3. API Query Efficiency — ACCEPTABLE FOR PILOT

**Center health scoring:** Linear scan across all incidents per center per call. At 39 incidents, ~5ms. At 5,000 incidents, potentially 200–500ms.  
**Command summary:** Full tenant incident scan on each request.  
**Recommendation for scale:** Add `(tenant_id, center_id, created_at)` composite index on incidents table.

### 4. Tenant Isolation — STRONG

All tables carry `tenant_id`. All queries filter by `tenant_id`. No cross-tenant data leakage observed in code review. JWT validates tenant on every request via DI chain.

**Gap:** No tenant-level rate limiting. A misbehaving tenant could generate excessive API load.  
**Recommendation:** Add `slowapi` rate limiter per tenant on write endpoints.

### 5. Image Storage — NOT PRODUCTION-READY

**Current:** Evidence files store a path string (`/demo/evidence/filename`) but no actual file storage backend. Files are not actually uploaded or retrievable.  
**Impact:** Evidence tab works for metadata and AI summaries, but actual files aren't stored.  
**Fix required:** Configure S3/Cloudflare R2/local persistent storage before any pilot that will use evidence uploads.

### 6. Database Migrations — SAFE

All migrations are idempotent (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). They run on startup without downtime risk for single-tenant deployments.  
**Gap:** No migration versioning (no Alembic or similar). If a migration needs to be rolled back, it must be done manually.  
**Recommendation for scale:** Add Alembic before any production multi-tenant deployment.

### 7. Audit Retention — COMPLIANT

`IncidentAuditLog` is append-only. `OSHARetentionRecord` tracks retention expiry dates. Both tables use UUIDs and tenant isolation.  
**Gap:** No read-only export of audit trail (needed for legal requests).

### 8. WebSocket Scaling — SINGLE-INSTANCE ONLY

**Current:** WebSocket events are broadcast in-memory via a global set per tenant.  
**Impact:** Works correctly for single-instance deployment (current state). Breaks if multiple API instances run behind a load balancer.  
**Recommendation for scale:** Replace with Redis pub/sub before horizontal scaling.

### 9. Secret Management — NEEDS ATTENTION

**Current:** Secrets in `api/.env` file on disk.  
**Gap:** `.env` is not in `.gitignore` — verify it hasn't been committed.  
**Gap:** Default admin password is `changeme` — documented but not forced to change.  
**Recommendation:** Force password change on first login. Add `.env` to `.gitignore`.

### 10. Backup Strategy — NOT CONFIGURED

No automated database backups are configured. A disk failure or accidental purge would lose all operational data.  
**Minimum for pilot:** Daily `pg_dump` to a separate location. Single command:  
```bash
pg_dump $DATABASE_URL | gzip > backup_$(date +%Y%m%d).sql.gz
```

---

## Production Readiness Scorecard

| Category | Pilot Ready | Scale Ready |
|----------|------------|-------------|
| API availability | ✓ | ⚠ (no restart on crash) |
| Database performance | ✓ | ⚠ (missing indexes at scale) |
| Tenant isolation | ✓ | ✓ |
| Log management | ✓ | ⚠ (no rotation) |
| Image storage | ✗ | ✗ |
| Migration safety | ✓ | ⚠ (no rollback capability) |
| Secret management | ⚠ | ✗ |
| Backup strategy | ✗ | ✗ |
| WebSocket scaling | ✓ | ✗ |
| Audit compliance | ✓ | ✓ |

---

## Minimum Requirements Before Pilot Launch

1. ✓ Change default admin password
2. ✗ Configure persistent image storage (S3/R2/local persistent mount)
3. ✗ Set up daily database backup
4. ✓ Verify `.env` not committed to git
5. ✓ Confirm `ANTHROPIC_API_KEY` configured (or explicitly communicate AI limitations)

## Recommended Before Second Pilot

1. Add log rotation
2. Add process restart on crash (systemd or PM2)
3. Add composite DB index for center health query
4. Add tenant rate limiting
5. Add Alembic migration versioning

---

*PackGuardian — Pilot Readiness Assessment*  
*Phase 22 Production Hardening Report*
