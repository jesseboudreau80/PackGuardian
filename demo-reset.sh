#!/usr/bin/env bash
# PackGuardian — Demo Reset
# Creates a stable, consistent demo state for presentations and pilot demos.
# Usage: ./demo-reset.sh [--local]
#
# What this does:
#   1. Verifies API is running
#   2. Wipes all demo operational data
#   3. Reseeds 4 narrative story arcs + 10 shift-based incidents (49 incidents, 6+ signals)
#   4. Backfills operational risk scores
#   5. Refreshes safety signal detection
#   6. Validates health
#   7. Prints executive walkthrough URLs

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Config ────────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "--local" ]]; then
  API_URL="http://localhost:8105"
  WEB_URL="http://localhost:3005"
else
  API_URL="https://packguardian-api.jesseboudreau.com"
  WEB_URL="https://packguardian.jesseboudreau.com"
fi

DEMO_EMAIL="${DEMO_EMAIL:-admin@packguardian.com}"
DEMO_PASSWORD="${DEMO_PASSWORD:-changeme}"

# ── Colors ────────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; exit 1; }
step() { echo -e "\n${BLUE}${BOLD}── $* ──────────────────────────────────────────${NC}"; }
info() { echo -e "  ${YELLOW}◎${NC} $*"; }

# ── Header ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}${BOLD}║     PackGuardian — Demo Environment Reset            ║${NC}"
echo -e "${BLUE}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo -e "  Target: ${API_URL}"
echo -e "  $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ── Step 1: Verify API is running ─────────────────────────────────────────────

step "Checking API health"
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/health" 2>/dev/null || echo "000")
if [[ "$API_STATUS" != "200" ]]; then
  fail "API not responding (HTTP ${API_STATUS}). Run: bash start.sh"
fi
ok "API is healthy"

# ── Step 2: Authenticate ──────────────────────────────────────────────────────

step "Authenticating"
AUTH_RESPONSE=$(curl -s --max-time 10 -X POST "${API_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${DEMO_EMAIL}\",\"password\":\"${DEMO_PASSWORD}\"}" 2>/dev/null)

TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null || echo "")
if [[ -z "$TOKEN" ]]; then
  fail "Authentication failed. Check DEMO_EMAIL and DEMO_PASSWORD."
fi
ok "Authenticated as ${DEMO_EMAIL}"

# ── Helper: make authenticated API call ───────────────────────────────────────

api_post() {
  local path="$1"
  curl -s --max-time 60 -X POST "${API_URL}${path}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" 2>/dev/null
}

api_get() {
  local path="$1"
  curl -s --max-time 30 "${API_URL}${path}" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null
}

# ── Step 3: Reset demo data ───────────────────────────────────────────────────

step "Resetting demo data"
info "Wiping all operational data and reseeding narrative arcs..."

RESET_RESPONSE=$(api_post "/provision/reset-demo")
if echo "$RESET_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'reset' in d else 1)" 2>/dev/null; then
  COUNTS=$(echo "$RESET_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
parts = []
for k in ['incidents','narrative_incidents','cases','corrective_actions','narrative_corrective_actions','witness_statements','narrative_witness_statements']:
    if k in d:
        parts.append(f'{d[k]} {k.replace(\"_\", \" \")}')
print(', '.join(parts))
" 2>/dev/null)
  ok "Demo data seeded: ${COUNTS}"
else
  ERROR=$(echo "$RESET_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('detail','unknown'))" 2>/dev/null)
  fail "Demo reset failed: ${ERROR}"
fi

# ── Step 4: Backfill risk scores ──────────────────────────────────────────────

step "Computing risk scores"
BACKFILL_RESPONSE=$(api_post "/provision/backfill-risk-scores")
BACKFILLED=$(echo "$BACKFILL_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('backfilled',0))" 2>/dev/null || echo "0")
ok "Risk scores computed for ${BACKFILLED} incidents"

# ── Step 5: Refresh safety signals ───────────────────────────────────────────

step "Detecting safety signals"
SIGNALS_RESPONSE=$(api_post "/signals/refresh")
SIGNAL_COUNT=$(echo "$SIGNALS_RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
ok "${SIGNAL_COUNT} safety signals detected"

if [[ "$SIGNAL_COUNT" -gt 0 ]]; then
  echo "$SIGNALS_RESPONSE" | python3 -c "
import sys, json
for s in json.load(sys.stdin):
    print(f\"    [{s['severity'].upper()}] {s['title']}\")
" 2>/dev/null || true
fi

# ── Step 6: Validate data state ───────────────────────────────────────────────

step "Validating demo state"
INCIDENTS=$(api_get "/incidents" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
CASES=$(api_get "/cases" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
SIGNALS_NOW=$(api_get "/signals" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

[[ "$INCIDENTS" -ge 45 ]] && ok "Incidents: ${INCIDENTS}" || info "Incidents: ${INCIDENTS} (low — expected 49+)"
[[ "$CASES" -ge 30 ]] && ok "Cases: ${CASES}" || info "Cases: ${CASES} (low)"
[[ "$SIGNALS_NOW" -ge 4 ]] && ok "Active signals: ${SIGNALS_NOW}" || info "Signals: ${SIGNALS_NOW} (low — expected 6)"

# ── Step 7: Web health ────────────────────────────────────────────────────────

step "Checking web"
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${WEB_URL}" 2>/dev/null || echo "000")
if [[ "$WEB_STATUS" == "200" ]]; then
  ok "Web responding"
else
  info "Web returned HTTP ${WEB_STATUS} — may still be starting"
fi

# ── Step 8: Print demo URLs ───────────────────────────────────────────────────

echo ""
echo -e "${BLUE}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}${BOLD}║          Demo Environment Ready                      ║${NC}"
echo -e "${BLUE}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Login:${NC}"
echo -e "  ${WEB_URL}/login"
echo -e "  Email:    ${DEMO_EMAIL}"
echo -e "  Password: ${DEMO_PASSWORD}"
echo ""
echo -e "  ${BOLD}Executive Walkthrough Path:${NC}"
echo -e "  1. Command Center:   ${WEB_URL}/command"
echo -e "  2. Executive Brief:  ${WEB_URL}/executive"
echo -e "  3. Cases (open Zeus case first): ${WEB_URL}/cases"
echo -e "  4. Mobile Demo:      ${WEB_URL}/mobile"
echo -e "  5. QR Scan Demo:     ${WEB_URL}/mobile/scan"
echo ""
echo -e "  ${BOLD}Key Demo Stories:${NC}"
echo -e "  • FL-JAX: 3 slip/fall incidents — rear drain trap pattern"
echo -e "  • GA-ATL: Zeus dog aggression escalation (L2 critical)"
echo -e "  • PA-PIT: Grooming dryer failure x2 — equipment arc"
echo -e "  • NY-BRK: Understaffed closing shift — sanitation + near-miss"
echo ""
echo -e "  ${BOLD}Signal Count:${NC} ${SIGNALS_NOW} active signals"
echo -e "  ${BOLD}Incident Count:${NC} ${INCIDENTS} total"
echo ""
echo -e "  ${GREEN}${BOLD}Demo environment is ready. Good luck! 🐕${NC}"
echo ""
