"""
WebSocket endpoint.

Connection URL:  ws[s]://host/ws?token=<jwt>

After authentication, clients are subscribed to:
  tenant:{tenant_id}  — all events in their tenant
  user:{user_id}      — personal notifications

The client may send "ping" to keep the connection alive; the server responds "pong".
Any other text messages are silently ignored.
"""
import logging
import uuid

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.modules.auth.security import decode_token

from .manager import manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
) -> None:
    # ── Authenticate before accepting ────────────────────────────────────────
    try:
        payload = decode_token(token)
        user_id = uuid.UUID(payload["sub"])
        tenant_id = uuid.UUID(payload["tenant_id"])
    except Exception:
        await websocket.close(code=4001)  # custom: 4001 = Unauthorized
        return

    channels = [f"tenant:{tenant_id}", f"user:{user_id}"]
    await manager.connect(websocket, channels)
    logger.info("WS connected user=%s tenant=%s", user_id, tenant_id)

    try:
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("WS error user=%s: %s", user_id, exc)
    finally:
        manager.disconnect(websocket, channels)
        logger.debug("WS disconnected user=%s", user_id)
