#!/usr/bin/env bash
# PackGuardian restart — stop + start
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log() { echo "[packguardian] $*"; }

log "Restarting PackGuardian..."
"$ROOT/stop.sh"
sleep 2
exec "$ROOT/start.sh" "$@"
