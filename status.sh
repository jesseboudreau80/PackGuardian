#!/usr/bin/env bash
# PackGuardian System Status
# Usage: ./status.sh [--local]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS="$ROOT/.logs"

# ── Config ────────────────────────────────────────────────────────────────────

API_PORT=8105
WEB_PORT=3005

if [[ "${1:-}" == "--local" ]]; then
  API_URL="http://localhost:$API_PORT"
  WEB_URL="http://localhost:$WEB_PORT"
else
  API_URL="https://packguardian-api.jesseboudreau.com"
  WEB_URL="https://packguardian.jesseboudreau.com"
fi

# ── Colors ────────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
GRAY='\033[0;90m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; }
info() { echo -e "  ${BLUE}◎${NC} $*"; }

# ── Header ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         PackGuardian System Status               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo -e "  ${GRAY}$(date '+%Y-%m-%d %H:%M:%S %Z')${NC}"
echo ""

# ── Process Check ─────────────────────────────────────────────────────────────

echo -e "${BLUE}── Processes ──────────────────────────────────────${NC}"

API_PID=$(pgrep -f "uvicorn main:app" 2>/dev/null | head -1 || true)
WEB_PID=$(fuser ${WEB_PORT}/tcp 2>/dev/null | tr -d ' ' || true)

if [[ -n "$API_PID" ]]; then
  ok "API process running (PID $API_PID, port $API_PORT)"
else
  fail "API process not running"
fi

if [[ -n "$WEB_PID" ]]; then
  ok "Web process running (PID $WEB_PID, port $WEB_PORT)"
else
  fail "Web process not running"
fi

echo ""

# ── Health Checks ─────────────────────────────────────────────────────────────

echo -e "${BLUE}── Health Checks ──────────────────────────────────${NC}"

# API health
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${API_URL}/health" 2>/dev/null || echo "000")
if [[ "$API_STATUS" == "200" ]]; then
  API_DETAIL=$(curl -s --max-time 5 "${API_URL}/health" 2>/dev/null || echo '{}')
  ok "API responding: ${API_URL}"
  echo -e "     ${GRAY}${API_DETAIL}${NC}"
else
  fail "API not responding (HTTP ${API_STATUS}): ${API_URL}"
fi

# Web health
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${WEB_URL}" 2>/dev/null || echo "000")
if [[ "$WEB_STATUS" == "200" || "$WEB_STATUS" == "308" ]]; then
  ok "Web responding: ${WEB_URL}"
else
  fail "Web not responding (HTTP ${WEB_STATUS}): ${WEB_URL}"
fi

echo ""

# ── Database ──────────────────────────────────────────────────────────────────

echo -e "${BLUE}── Database ────────────────────────────────────────${NC}"

DB_URL="${DATABASE_URL:-$(grep DATABASE_URL "$ROOT/api/.env" 2>/dev/null | cut -d= -f2- || true)}"
if [[ -n "$DB_URL" ]]; then
  if psql "$DB_URL" -c "SELECT 1" > /dev/null 2>&1; then
    ok "PostgreSQL connection verified"
    # Table count
    TABLE_COUNT=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null | tr -d ' ' || echo "?")
    info "Tables in schema: ${TABLE_COUNT}"
  else
    fail "PostgreSQL connection failed"
  fi
else
  warn "DATABASE_URL not found — skipping DB check"
fi

echo ""

# ── Environment ───────────────────────────────────────────────────────────────

echo -e "${BLUE}── Configuration ───────────────────────────────────${NC}"

ENV_FILE="$ROOT/api/.env"
if [[ -f "$ENV_FILE" ]]; then
  ok ".env found at $ENV_FILE"

  if grep -q "ANTHROPIC_API_KEY=sk-" "$ENV_FILE" 2>/dev/null; then
    ok "ANTHROPIC_API_KEY configured (AI extraction enabled)"
  else
    warn "ANTHROPIC_API_KEY not set — AI extraction using rule-based fallback"
  fi

  if grep -q "changeme\|CHANGE_ME\|default_secret" "$ENV_FILE" 2>/dev/null; then
    warn "Default secrets detected in .env — change before production use"
  fi
else
  fail ".env not found at $ENV_FILE"
fi

echo ""

# ── Logs ──────────────────────────────────────────────────────────────────────

echo -e "${BLUE}── Recent Logs ─────────────────────────────────────${NC}"

if [[ -f "$LOGS/api.log" ]]; then
  LAST_LOG=$(tail -3 "$LOGS/api.log" 2>/dev/null | grep -v "^$" | tail -1 || echo "(empty)")
  info "API log: $LOGS/api.log"
  echo -e "     ${GRAY}$LAST_LOG${NC}"
else
  warn "API log not found"
fi

if [[ -f "$LOGS/web.log" ]]; then
  LAST_WEB=$(tail -3 "$LOGS/web.log" 2>/dev/null | grep -v "^$" | tail -1 || echo "(empty)")
  info "Web log: $LOGS/web.log"
  echo -e "     ${GRAY}$LAST_WEB${NC}"
else
  warn "Web log not found"
fi

echo ""

# ── Summary ───────────────────────────────────────────────────────────────────

echo -e "${BLUE}── Quick Reference ─────────────────────────────────${NC}"
echo -e "  API:      ${API_URL}"
echo -e "  Web:      ${WEB_URL}"
echo -e "  Logs:     ${LOGS}/"
echo -e "  Start:    bash start.sh"
echo -e "  Stop:     bash stop.sh"
echo -e "  Reset:    POST ${API_URL}/provision/reset-demo"
echo -e "  Backfill: POST ${API_URL}/provision/backfill-risk-scores"
echo ""
