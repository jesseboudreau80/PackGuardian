#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS="$ROOT/.logs"
mkdir -p "$LOGS"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()        { echo "[packguardian] $*"; }
log_api()    { echo "[packguardian][api] $*"; }
log_web()    { echo "[packguardian][web] $*"; }
log_tunnel() { echo "[packguardian][tunnel] $*"; }

die()        { echo "[packguardian] ERROR: $*" >&2; exit 1; }
die_api()    { echo "[packguardian][api] ERROR: $*" >&2; exit 1; }
die_web()    { echo "[packguardian][web] ERROR: $*" >&2; exit 1; }
die_tunnel() { echo "[packguardian][tunnel] ERROR: $*" >&2; exit 1; }

log_section() {
  local svc="$1" label="$2" file="$3"
  echo "[packguardian][$svc] $(date '+%Y-%m-%d %H:%M:%S') ── $label ──────────────────────────────" >> "$file"
}

# ── ENV file enforcement ──────────────────────────────────────────────────────
[ -f "$ROOT/api/.env" ] \
  || die "Missing api/.env — copy from api/.env.example and fill in your values."

APP_ENV="$(grep -E '^ENV=' "$ROOT/api/.env" | cut -d= -f2 | tr -d '[:space:]')"
APP_ENV="${APP_ENV:-prod}"
log "Environment mode: $APP_ENV"

# ── Dependency check ──────────────────────────────────────────────────────────
command -v python3     &>/dev/null || die "python3 is not installed."
command -v node        &>/dev/null || die "node is not installed."
command -v npm         &>/dev/null || die "npm is not installed."
command -v curl        &>/dev/null || die "curl is not installed."
command -v cloudflared &>/dev/null \
  || die "cloudflared is not installed. See: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"

# ── Cloudflare tunnel validation ──────────────────────────────────────────────
log_tunnel "Validating named tunnel 'packguardian'..."
cloudflared tunnel list 2>/dev/null | grep -q "packguardian" \
  || die_tunnel "Tunnel 'packguardian' not found. Run: cloudflared tunnel create packguardian"
log_tunnel "Tunnel 'packguardian' confirmed."

# ── Stop existing processes ───────────────────────────────────────────────────
log "Stopping any existing processes..."
lsof -ti:8100 | xargs kill -9 2>/dev/null || true
lsof -ti:3000  | xargs kill -9 2>/dev/null || true
pkill -f "cloudflared tunnel run packguardian" 2>/dev/null || true
sleep 1

# ── Verify ports are free ─────────────────────────────────────────────────────
lsof -ti:8100 &>/dev/null && die "Port 8100 is still in use after kill attempt. Aborting."
lsof -ti:3000  &>/dev/null && die "Port 3000 is still in use after kill attempt. Aborting."
log "Ports 8100 and 3000 are free."

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 1 — API
# ══════════════════════════════════════════════════════════════════════════════
log_api "Setting up Python virtual environment at api/.venv..."
cd "$ROOT/api"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt -q

log_api "Starting on port 8100..."
export LOG_FILE="$LOGS/api.log"
log_section "api" "API startup" "$LOGS/api.log"

nohup .venv/bin/uvicorn main:app \
  --host 0.0.0.0 \
  --port 8100 \
  --log-level info \
  >> "$LOGS/api.log" 2>&1 &
API_PID=$!
disown $API_PID
log_api "Process started (PID $API_PID)"

# Health check — web and tunnel will NOT start if this fails
log_api "Waiting for health check..."
HEALTHY=0
for i in $(seq 1 15); do
  if curl -sf http://localhost:8100/health > /dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 1
done

if [ "$HEALTHY" -ne 1 ]; then
  echo ""
  die_api "Health check failed after 15 seconds — web and tunnel will NOT start.
  Check logs: $LOGS/api.log"
fi
log_api "Health check passed."

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 2 — WEB  (only reached if API is healthy)
# ══════════════════════════════════════════════════════════════════════════════
log_web "Building (production mode)..."
cd "$ROOT/web"

log_section "web" "Web build" "$LOGS/web.log"
npm install --silent >> "$LOGS/web.log" 2>&1 \
  || die_web "npm install failed — tunnel will NOT start. Check logs: $LOGS/web.log"

npm run build >> "$LOGS/web.log" 2>&1 \
  || die_web "Build failed — tunnel will NOT start. Check logs: $LOGS/web.log"

log_web "Build succeeded. Starting on port 3000..."
log_section "web" "Web startup" "$LOGS/web.log"
nohup npm start >> "$LOGS/web.log" 2>&1 &
WEB_PID=$!
disown $WEB_PID
log_web "Process started (PID $WEB_PID)"

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 3 — TUNNEL  (only reached if web build succeeded)
# ══════════════════════════════════════════════════════════════════════════════
log_tunnel "Starting named tunnel 'packguardian'..."
log_section "tunnel" "Tunnel startup" "$LOGS/tunnel.log"
nohup cloudflared tunnel run packguardian >> "$LOGS/tunnel.log" 2>&1 &
TUNNEL_PID=$!
disown $TUNNEL_PID
log_tunnel "Process started (PID $TUNNEL_PID)"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          [packguardian] System Started                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Production                                                  ║"
echo "║    API:    https://packguardian-api.jesseboudreau.com        ║"
echo "║    Web:    https://packguardian.jesseboudreau.com            ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Local                                                       ║"
echo "║    API:    http://localhost:8100                             ║"
echo "║    Docs:   http://localhost:8100/docs                        ║"
echo "║    Web:    http://localhost:3000                             ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Logs                                                        ║"
echo "║    API:    $LOGS/api.log"
echo "║    Web:    $LOGS/web.log"
echo "║    Tunnel: $LOGS/tunnel.log"
echo "╚══════════════════════════════════════════════════════════════╝"
