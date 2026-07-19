# PackGuardian — Deployment Runbook
*Exact operational procedures for running and recovering the platform*
*Generated: 2026-05-20*

---

## System Architecture

```
Internet
  └── Cloudflare Tunnel ("reselleros" tunnel, tunnel config at ~/.cloudflared/config.yml)
        ├── packguardian-api.jesseboudreau.com → localhost:8105
        └── packguardian.jesseboudreau.com    → localhost:3005

localhost:8105   FastAPI/uvicorn (Python)
  ├── PostgreSQL at localhost:5432 (database: packguardian)
  └── File storage at UPLOAD_DIR (currently /tmp/packguardian_uploads — NOT PERSISTENT)

localhost:3005   Next.js production server (pre-built)
```

---

## Environment Files

| File | Purpose | Status |
|------|---------|--------|
| `api/.env` | API config (DB URL, JWT secret, upload dir) | Required |
| `web/.env.local` | Frontend API URL (NEXT_PUBLIC_API_URL) | Required for build |
| `web/.env.production` | Same as .env.local for prod builds | Exists |

**Critical values in `api/.env`:**
```
ENV=prod
DATABASE_URL=postgresql+psycopg2://packguardian:PackGuardian2024!@localhost:5432/packguardian
JWT_SECRET=[secret]
JWT_EXPIRE_HOURS=24
UPLOAD_DIR=/tmp/packguardian_uploads   ← CHANGE THIS to a persistent path
```

---

## Startup Flow (Normal)

```bash
cd /home/jesse/infra/apps/packguardian
./start.sh
```

**What `start.sh` does, in order:**
1. Reads `api/.env` and validates it exists
2. Kills any process on ports 8105 or 3005
3. Waits 1 second, verifies ports are free
4. `cd api` → activates venv → `pip install -r requirements.txt -q`
5. Starts uvicorn: `nohup .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8105 --log-level info`
6. **Health check loop**: polls `http://localhost:8105/health` for up to 15 seconds
7. If health check fails → exits with error. **Web does NOT start if API is unhealthy.**
8. `cd web` → `npm install --silent` → `npm run build` (3–5 minutes)
9. Starts Next.js: `nohup npm start` (uses PORT=3005)
10. Prints summary box with URLs

**Logs:**
- API: `/home/jesse/infra/apps/packguardian/.logs/api.log`
- Web: `/home/jesse/infra/apps/packguardian/.logs/web.log`

---

## Stop Flow

```bash
./stop.sh
```

**What `stop.sh` does:**
1. `lsof -ti:8105 | xargs kill -9` — kills API process
2. `lsof -ti:3005 | xargs kill -9` — kills web process
3. `pkill -f "cloudflared tunnel run packguardian"` — kills any packguardian-specific tunnel (note: the main "reselleros" tunnel is NOT killed)

---

## Status Check

```bash
./status.sh          # checks tunnel (production) URLs
./status.sh --local  # checks localhost URLs only
```

**What `status.sh` checks:**
- API process running (by pgrep)
- Web process running (by port scan)
- API health endpoint responds
- Web health endpoint responds
- PostgreSQL connection works
- `.env` present and checked for default secrets
- Last 3 lines of each log file

---

## Quick Operations

### Restart API only (no web rebuild)
```bash
lsof -ti:8105 | xargs kill -9 2>/dev/null || true
sleep 1
cd /home/jesse/infra/apps/packguardian/api
nohup .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8105 --log-level info \
  >> /home/jesse/infra/apps/packguardian/.logs/api.log 2>&1 &
disown
cd /home/jesse/infra/apps/packguardian
```

### Check if services are up
```bash
curl -sf http://localhost:8105/health && echo "API OK" || echo "API DOWN"
curl -sf http://localhost:3005 -o /dev/null -w "%{http_code}" && echo " WEB OK" || echo "WEB DOWN"
```

### View live API logs
```bash
tail -f /home/jesse/infra/apps/packguardian/.logs/api.log
```

### Reset demo data
```bash
# Only run on demo tenant. Will wipe ALL incidents, cases, CAs, signals for the tenant.
curl -X POST https://packguardian-api.jesseboudreau.com/provision/reset-demo \
  -H "Authorization: Bearer <admin_token>"
```

### Seed demo data (after reset)
```bash
curl -X POST https://packguardian-api.jesseboudreau.com/provision/seed-demo \
  -H "Authorization: Bearer <admin_token>"
```

### Get admin token (for API operations)
```bash
TOKEN=$(curl -sf -X POST https://packguardian-api.jesseboudreau.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_ADMIN_EMAIL","password":"YOUR_PASSWORD"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo $TOKEN
```

---

## Recovery Procedures

### API won't start

```bash
# Check what's in the logs
tail -50 /home/jesse/infra/apps/packguardian/.logs/api.log

# Common causes:
# 1. Port still in use
lsof -i:8105
# Fix: kill -9 the PID shown

# 2. DB connection failed
psql postgresql://packguardian:PackGuardian2024!@localhost:5432/packguardian -c "SELECT 1"
# Fix: sudo systemctl restart postgresql

# 3. .env missing
ls /home/jesse/infra/apps/packguardian/api/.env
# Fix: recreate from backup or copy .env.example

# 4. Python syntax error in changed files
cd /home/jesse/infra/apps/packguardian/api
.venv/bin/python -m py_compile main.py
```

### Web won't start / build fails

```bash
# Check build logs
tail -100 /home/jesse/infra/apps/packguardian/.logs/web.log

# Common causes:
# 1. Missing NEXT_PUBLIC_API_URL
cat /home/jesse/infra/apps/packguardian/web/.env.local
# Fix: create with NEXT_PUBLIC_API_URL=https://packguardian-api.jesseboudreau.com

# 2. TypeScript errors in changed files
cd /home/jesse/infra/apps/packguardian/web
npx tsc --noEmit 2>&1 | head -30

# 3. Port 3005 stuck
lsof -i:3005 | awk 'NR>1{print $2}' | xargs kill -9 2>/dev/null || true
```

### Tunnel not routing

```bash
# Check if cloudflared is running
pgrep -f cloudflared

# Check tunnel status
cloudflared tunnel info reselleros 2>/dev/null || cloudflared tunnel list

# If tunnel is down, restart it
# (This restarts the entire reselleros tunnel, which serves all apps — check with Jesse first)
```

### Database issues

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Connect manually
psql postgresql://packguardian:PackGuardian2024!@localhost:5432/packguardian

# Check incident count (sanity check)
psql postgresql://packguardian:PackGuardian2024!@localhost:5432/packguardian \
  -c "SELECT COUNT(*) FROM incidents;"

# Tables exist?
psql postgresql://packguardian:PackGuardian2024!@localhost:5432/packguardian \
  -c "\dt"
```

### Evidence files missing after restart

This is expected behavior: `UPLOAD_DIR=/tmp/packguardian_uploads` is cleared on reboot.

```bash
# Immediate fix: change UPLOAD_DIR to a persistent path
echo "UPLOAD_DIR=/home/jesse/infra/apps/packguardian/uploads" >> api/.env
mkdir -p /home/jesse/infra/apps/packguardian/uploads
./stop.sh && ./start.sh
```

---

## Known Operational Hazards

| Hazard | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Server reboot wipes /tmp uploads | Low (monthly OS updates) | HIGH — all evidence lost | Change UPLOAD_DIR to persistent path |
| `start.sh` takes 5 min on code change | Every deploy | Medium — slow iteration | Use restart-api shortcut for API-only changes |
| Default admin password is "changeme" | Constant risk while URL is public | CRITICAL | Change it now |
| `reset-demo` called on wrong tenant | User error | HIGH — data loss | Add tenant guard to reset endpoint |
| Web build fails mid-deploy | Rare | Medium — API up, web down | Health check in start.sh for web too |
| JWT expires during active session | Every 24 hours | Low — graceful redirect to login | Acceptable for pilot |

---

## Deployment Checklist (Before Pilot)

- [ ] Change admin@packguardian.com password
- [ ] Move UPLOAD_DIR to persistent path
- [ ] Add `localhost:3005` to CORS_ORIGINS  
- [ ] Add `is_active` check to `get_current_user`
- [ ] Add startup failure if JWT_SECRET is the default value
- [ ] Lock demo reset to demo tenant ID
- [ ] Run `./status.sh` and verify all green
- [ ] Run `./demo-reset.sh` and verify 49+ incidents seed correctly
- [ ] Test voice intake from an Android device
- [ ] Test photo upload and verify files persist in the evidence tab

---

*PackGuardian — Deployment Runbook*
