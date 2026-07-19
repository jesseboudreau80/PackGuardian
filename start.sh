#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS="$ROOT/.logs"
mkdir -p "$LOGS"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()     { echo "[packguardian] $*"; }
log_api() { echo "[packguardian][api] $*"; }
log_web() { echo "[packguardian][web] $*"; }

die()     { echo "[packguardian] ERROR: $*" >&2; exit 1; }
die_api() { echo "[packguardian][api] ERROR: $*" >&2; exit 1; }
die_web() { echo "[packguardian][web] ERROR: $*" >&2; exit 1; }

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
command -v python3 &>/dev/null || die "python3 is not installed."
command -v node    &>/dev/null || die "node is not installed."
command -v npm     &>/dev/null || die "npm is not installed."
command -v curl    &>/dev/null || die "curl is not installed."

# NOTE: Cloudflare tunnel is managed by the ecosystem reselleros tunnel.
# PackGuardian routes (ports 8105/3005) are already registered in
# ~/.cloudflared/config.yml. No per-app tunnel is needed.

# ── Stop existing processes ───────────────────────────────────────────────────
log "Stopping any existing processes..."
# Stop systemd services first — Restart=always means they respawn any killed
# process immediately, causing the port-free check below to fail.
sudo systemctl stop packguardian-api.service packguardian-web.service 2>/dev/null || true
sleep 1
lsof -ti:8105 | xargs kill -9 2>/dev/null || true
lsof -ti:3005  | xargs kill -9 2>/dev/null || true
sleep 1

# ── Cloudflare tunnel — clean stale connectors ────────────────────────────────
# Stale connectors accumulate across restarts and cause Cloudflare to route to dead
# processes (returning 404). Must stop daemon, run cleanup with --origincert, then
# restart so only one fresh connector exists.
if command -v cloudflared &>/dev/null; then
  CFCFG="$HOME/.cloudflared/config.yml"
  CFCERT="$HOME/.cloudflared/cert.pem"
  TUNNEL_NAME="reselleros"
  if [ -f "$CFCFG" ] && [ -f "$CFCERT" ]; then
    log "Cleaning stale Cloudflare tunnel connectors..."
    sudo systemctl stop cloudflared.service 2>/dev/null || true
    sleep 2
    # Run cleanup up to 3 times until Cloudflare confirms zero active connections
    for _attempt in 1 2 3; do
      sudo /usr/local/bin/cloudflared tunnel \
        --config "$CFCFG" \
        --origincert "$CFCERT" \
        cleanup "$TUNNEL_NAME" 2>/dev/null || true
      sleep 2
      _info=$(/usr/local/bin/cloudflared tunnel --config "$CFCFG" info "$TUNNEL_NAME" 2>/dev/null || true)
      if echo "$_info" | grep -q "does not have any active connection"; then
        break
      fi
      sleep 3
    done
    sudo systemctl start cloudflared.service 2>/dev/null || true
    sleep 8  # allow fresh connector to fully register with CF edge
    log "Cloudflare tunnel restarted."
  fi
fi

# ── Verify ports are free ─────────────────────────────────────────────────────
lsof -ti:8105 &>/dev/null && die "Port 8105 is still in use after kill attempt. Aborting."
lsof -ti:3005  &>/dev/null && die "Port 3005 is still in use after kill attempt. Aborting."
log "Ports 8105 and 3005 are free."

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

log_api "Starting on port 8105..."
export LOG_FILE="$LOGS/api.log"
log_section "api" "API startup" "$LOGS/api.log"

nohup .venv/bin/uvicorn main:app \
  --host 0.0.0.0 \
  --port 8105 \
  --log-level info \
  >> "$LOGS/api.log" 2>&1 &
API_PID=$!
disown $API_PID
log_api "Process started (PID $API_PID)"

# Health check — web will NOT start if this fails
log_api "Waiting for health check..."
HEALTHY=0
for i in $(seq 1 15); do
  if curl -sf http://localhost:8105/health > /dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 1
done

if [ "$HEALTHY" -ne 1 ]; then
  echo ""
  die_api "Health check failed after 15 seconds. Check logs: $LOGS/api.log"
fi
log_api "Health check passed."

# ══════════════════════════════════════════════════════════════════════════════
# STAGE 2 — WEB  (only reached if API is healthy)
# ══════════════════════════════════════════════════════════════════════════════
log_web "Building (production mode)..."
cd "$ROOT/web"

log_section "web" "Web build" "$LOGS/web.log"
npm install --silent >> "$LOGS/web.log" 2>&1 \
  || die_web "npm install failed. Check logs: $LOGS/web.log"

npm run build >> "$LOGS/web.log" 2>&1 \
  || die_web "Build failed. Check logs: $LOGS/web.log"

log_web "Build succeeded. Starting on port 3005..."
log_section "web" "Web startup" "$LOGS/web.log"
export PORT=3005
nohup npm start >> "$LOGS/web.log" 2>&1 &
WEB_PID=$!
disown $WEB_PID
log_web "Process started (PID $WEB_PID)"

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
echo "║    API:    http://localhost:8105                             ║"
echo "║    Docs:   http://localhost:8105/docs                        ║"
echo "║    Web:    http://localhost:3005                             ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Logs                                                        ║"
echo "║    API:    $LOGS/api.log"
echo "║    Web:    $LOGS/web.log"
echo "╚══════════════════════════════════════════════════════════════╝"
