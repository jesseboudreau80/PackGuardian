#!/bin/bash
# PackGuardian Frontend -- exec launcher
fuser -k 3005/tcp 2>/dev/null || true
sleep 0.5
cd "$(dirname "${BASH_SOURCE[0]}")/web"
exec node node_modules/.bin/next start -p 3005
