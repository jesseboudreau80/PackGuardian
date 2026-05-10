"""
Webhook dispatch for n8n (and any HTTP endpoint) workflow integration.
Non-fatal — exceptions are caught, logged, and written to workflow_deliveries.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import requests
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .models import AutomationEvent, WorkflowConfig, WorkflowDelivery

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 5
_MAX_RESPONSE_BODY = 2000


def dispatch_for_event(db: Session, event: AutomationEvent) -> None:
    """
    Find all enabled WorkflowConfigs matching this event's type and fire each.
    Writes a WorkflowDelivery record for every attempt, success or failure.
    The caller must have already committed the event row so it has a stable ID.
    """
    try:
        configs = (
            db.query(WorkflowConfig)
            .filter(
                WorkflowConfig.tenant_id == event.tenant_id,
                WorkflowConfig.is_enabled == True,  # noqa: E712
                or_(
                    WorkflowConfig.event_type == event.event_type,
                    WorkflowConfig.event_type == "*",
                ),
            )
            .all()
        )
    except Exception:
        logger.exception(
            "[packguardian][automation] Failed to query workflow configs for event=%s", event.id
        )
        return

    for config in configs:
        _fire_delivery(db, event, config)


def _fire_delivery(
    db: Session,
    event: AutomationEvent,
    config: WorkflowConfig,
) -> WorkflowDelivery:
    """
    POST the event payload to the webhook URL, create a WorkflowDelivery record,
    and commit it.  Returns the delivery regardless of success or failure.
    """
    payload = {
        "event_id": str(event.id),
        "event_type": event.event_type,
        "severity": event.severity,
        "payload": event.payload,
        "tenant_id": str(event.tenant_id),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    delivery = WorkflowDelivery(
        tenant_id=event.tenant_id,
        event_id=event.id,
        workflow_config_id=config.id,
        status="pending",
        attempted_at=datetime.now(timezone.utc),
    )
    db.add(delivery)

    try:
        resp = requests.post(
            config.webhook_url,
            json=payload,
            timeout=_TIMEOUT_SECONDS,
            headers={"Content-Type": "application/json", "User-Agent": "PackGuardian/1.0"},
        )
        delivery.status = "success" if resp.ok else "failure"
        delivery.response_code = resp.status_code
        delivery.response_body = resp.text[:_MAX_RESPONSE_BODY]
        logger.info(
            "[packguardian][automation] Webhook delivered: event=%s config=%s status=%d",
            event.id,
            config.id,
            resp.status_code,
        )
    except Exception as exc:
        delivery.status = "failure"
        delivery.response_code = None
        delivery.response_body = str(exc)[:_MAX_RESPONSE_BODY]
        logger.warning(
            "[packguardian][automation] Webhook delivery failed: event=%s config=%s error=%s",
            event.id,
            config.id,
            exc,
        )

    try:
        db.commit()
        db.refresh(delivery)
    except Exception:
        logger.exception(
            "[packguardian][automation] Failed to persist delivery record for event=%s", event.id
        )

    return delivery


def retry_delivery(
    db: Session,
    original_delivery: WorkflowDelivery,
) -> WorkflowDelivery:
    """
    Re-fires the webhook for a previous delivery.
    Creates a NEW delivery record (preserves history).
    """
    config = db.query(WorkflowConfig).filter(
        WorkflowConfig.id == original_delivery.workflow_config_id
    ).first()
    if not config:
        raise ValueError(f"WorkflowConfig {original_delivery.workflow_config_id} not found")

    event = db.query(AutomationEvent).filter(
        AutomationEvent.id == original_delivery.event_id
    ).first()
    if not event:
        raise ValueError(f"AutomationEvent {original_delivery.event_id} not found")

    return _fire_delivery(db, event, config)
