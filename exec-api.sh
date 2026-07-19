#!/bin/bash
# PackGuardian API -- exec launcher (systemd native ownership)
set -a
source "$(dirname "${BASH_SOURCE[0]}")/api/.env"
set +a

cd "$(dirname "${BASH_SOURCE[0]}")/api"

# Clear port before binding (prevents orphan collisions on restart)
fuser -k 8105/tcp 2>/dev/null || true
sleep 0.5

exec .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8105 --log-level info
