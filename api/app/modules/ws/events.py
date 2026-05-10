"""
Lightweight broadcast helpers — one function per event type.
All payloads are minimal: just the fields needed for the frontend
to know what changed and whether to re-fetch.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from .manager import broadcast_sync


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tid(tenant_id) -> str:
    return str(tenant_id)


def incident_created(
    tenant_id: uuid.UUID,
    *,
    incident_id: uuid.UUID,
    center_id: str,
    severity: str,
    category: str | None,
    risk_score: int | None,
) -> None:
    broadcast_sync(f"tenant:{_tid(tenant_id)}", {
        "type": "INCIDENT_CREATED",
        "incident_id": str(incident_id),
        "center_id": center_id,
        "severity": severity,
        "category": category,
        "risk_score": risk_score,
        "tenant_id": _tid(tenant_id),
        "ts": _now(),
    })


def case_assigned(
    tenant_id: uuid.UUID,
    *,
    case_id: uuid.UUID,
    incident_id: uuid.UUID,
    assigned_to_user_id: uuid.UUID | None,
    status: str,
) -> None:
    broadcast_sync(f"tenant:{_tid(tenant_id)}", {
        "type": "CASE_ASSIGNED",
        "case_id": str(case_id),
        "incident_id": str(incident_id),
        "assigned_to_user_id": str(assigned_to_user_id) if assigned_to_user_id else None,
        "status": status,
        "tenant_id": _tid(tenant_id),
        "ts": _now(),
    })


def case_escalated(
    tenant_id: uuid.UUID,
    *,
    case_id: uuid.UUID,
    incident_id: uuid.UUID,
    escalation_level: int,
    priority: str,
) -> None:
    broadcast_sync(f"tenant:{_tid(tenant_id)}", {
        "type": "CASE_ESCALATED",
        "case_id": str(case_id),
        "incident_id": str(incident_id),
        "escalation_level": escalation_level,
        "priority": priority,
        "tenant_id": _tid(tenant_id),
        "ts": _now(),
    })


def case_status_changed(
    tenant_id: uuid.UUID,
    *,
    case_id: uuid.UUID,
    new_status: str,
    priority: str,
) -> None:
    broadcast_sync(f"tenant:{_tid(tenant_id)}", {
        "type": "CASE_STATUS_CHANGED",
        "case_id": str(case_id),
        "new_status": new_status,
        "priority": priority,
        "tenant_id": _tid(tenant_id),
        "ts": _now(),
    })


def task_completed(
    tenant_id: uuid.UUID,
    *,
    task_id: uuid.UUID,
    case_id: uuid.UUID,
    title: str,
    completed: bool,
) -> None:
    broadcast_sync(f"tenant:{_tid(tenant_id)}", {
        "type": "TASK_COMPLETED" if completed else "TASK_REOPENED",
        "task_id": str(task_id),
        "case_id": str(case_id),
        "title": title,
        "tenant_id": _tid(tenant_id),
        "ts": _now(),
    })


def comment_added(
    tenant_id: uuid.UUID,
    *,
    comment_id: uuid.UUID,
    case_id: uuid.UUID,
    user_id: uuid.UUID,
    visibility: str,
) -> None:
    broadcast_sync(f"tenant:{_tid(tenant_id)}", {
        "type": "COMMENT_ADDED",
        "comment_id": str(comment_id),
        "case_id": str(case_id),
        "user_id": str(user_id),
        "visibility": visibility,
        "tenant_id": _tid(tenant_id),
        "ts": _now(),
    })


def notification_created(
    tenant_id: uuid.UUID,
    *,
    user_id: uuid.UUID,
    notification_id: uuid.UUID,
    notification_type: str,
    title: str,
) -> None:
    # User-specific channel — only reaches that user's WS connection
    broadcast_sync(f"user:{user_id}", {
        "type": "NOTIFICATION_CREATED",
        "notification_id": str(notification_id),
        "notification_type": notification_type,
        "title": title,
        "tenant_id": _tid(tenant_id),
        "ts": _now(),
    })


def evidence_uploaded(
    tenant_id: uuid.UUID,
    *,
    file_id: uuid.UUID,
    case_id: uuid.UUID,
    file_name: str,
    category: str,
    visibility: str,
) -> None:
    broadcast_sync(f"tenant:{_tid(tenant_id)}", {
        "type": "EVIDENCE_UPLOADED",
        "file_id": str(file_id),
        "case_id": str(case_id),
        "file_name": file_name,
        "category": category,
        "visibility": visibility,
        "tenant_id": _tid(tenant_id),
        "ts": _now(),
    })


def evidence_analyzed(
    tenant_id: uuid.UUID,
    *,
    file_id: uuid.UUID,
    case_id: uuid.UUID,
) -> None:
    broadcast_sync(f"tenant:{_tid(tenant_id)}", {
        "type": "EVIDENCE_ANALYZED",
        "file_id": str(file_id),
        "case_id": str(case_id),
        "tenant_id": _tid(tenant_id),
        "ts": _now(),
    })


def automation_triggered(
    tenant_id: uuid.UUID,
    *,
    event_id: uuid.UUID,
    event_type: str,
    severity: str,
    center_id: str | None,
) -> None:
    broadcast_sync(f"tenant:{_tid(tenant_id)}", {
        "type": "AUTOMATION_TRIGGERED",
        "event_id": str(event_id),
        "event_type": event_type,
        "severity": severity,
        "center_id": center_id,
        "tenant_id": _tid(tenant_id),
        "ts": _now(),
    })
