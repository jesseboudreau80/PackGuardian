#!/usr/bin/env bash

echo "[packguardian] Stopping all services..."

lsof -ti:8100 | xargs kill -9 2>/dev/null || true
lsof -ti:3000  | xargs kill -9 2>/dev/null || true
pkill -f "cloudflared tunnel run packguardian" 2>/dev/null || true

echo "[packguardian] All services stopped."
