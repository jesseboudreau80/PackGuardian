"""
WebSocket connection manager.

Channels:
  tenant:{tenant_id}  — all authenticated users in a tenant
  user:{user_id}      — single user (for notifications)

Broadcasting from synchronous FastAPI route handlers is done via
asyncio.run_coroutine_threadsafe() against the loop captured at app startup.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# The running event loop captured in main.py @app.on_event("startup").
# Set before any broadcasts are attempted.
_loop: asyncio.AbstractEventLoop | None = None


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


class ConnectionManager:
    def __init__(self) -> None:
        # channel → set of live WebSocket connections
        self._channels: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, channels: list[str]) -> None:
        await websocket.accept()
        for ch in channels:
            self._channels[ch].add(websocket)
        logger.debug("WS connected channels=%s total=%d", channels, self._total())

    def disconnect(self, websocket: WebSocket, channels: list[str]) -> None:
        for ch in channels:
            self._channels[ch].discard(websocket)
        logger.debug("WS disconnected channels=%s total=%d", channels, self._total())

    async def broadcast(self, channel: str, payload: dict) -> None:
        dead: set[WebSocket] = set()
        for ws in set(self._channels.get(channel, ())):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._channels[channel].discard(ws)

    def _total(self) -> int:
        return sum(len(v) for v in self._channels.values())


# Module-level singleton — imported by events.py and routes.py
manager = ConnectionManager()


def broadcast_sync(channel: str, payload: dict) -> None:
    """
    Schedule a WebSocket broadcast from a synchronous context.
    Safe to call from FastAPI thread-pool handlers.  Non-fatal if the loop
    is not yet set, has no connections, or the send fails.
    """
    if _loop is None or _loop.is_closed():
        return
    try:
        asyncio.run_coroutine_threadsafe(manager.broadcast(channel, payload), _loop)
    except Exception:
        pass  # never let WS failure affect the HTTP response
