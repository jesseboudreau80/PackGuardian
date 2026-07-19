"""
PackGuardian → #packguardian-lab Slack integration.

Mirrors the Aegis Iris pattern: multi-method, fire-and-forget, never raises.
All sends happen in daemon threads so they never block request handlers.

Configuration:
  Set SLACK_WEBHOOK_PACKGUARDIAN_LAB=https://hooks.slack.com/services/... in api/.env
  Set SLACK_SIGNING_SECRET=... for future inbound event verification

Usage:
    from app.services.slack import pg_slack
    pg_slack.incident_filed(incident_id, category="slip_fall", severity="medium", ...)
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_SEVERITY_EMOJI = {
    "critical": "🔴",
    "high":     "🟠",
    "medium":   "🟡",
    "low":      "🔵",
    "info":     "⚪",
    "success":  "🟢",
    "build":    "🔨",
}

CHANNEL_LAB = "packguardian-lab"


class PackGuardianSlack:
    """
    Slack router for PackGuardian. Posts to #packguardian-lab via incoming webhook.
    Acts as the lab wiki: build events, incident filings, OSHA flags, case escalations,
    demo seeds, and onboarding activity all stream here.
    """

    def _get_webhook(self) -> Optional[str]:
        try:
            from app.core.config import settings
            return getattr(settings, "slack_webhook_packguardian_lab", "") or None
        except Exception:
            return None

    def _post(self, text: str) -> None:
        webhook = self._get_webhook()
        if not webhook:
            logger.debug("pg-slack | no webhook configured for #packguardian-lab — skipping")
            return
        try:
            import requests as _req
            resp = _req.post(webhook, json={"text": text}, timeout=4)
            if resp.status_code != 200:
                logger.debug("pg-slack | HTTP %s: %s", resp.status_code, resp.text[:80])
        except Exception as exc:
            logger.debug("pg-slack | post failed (non-fatal): %s", exc)

    def _fire(self, text: str) -> None:
        """Send in a daemon thread — never blocks the calling request handler."""
        threading.Thread(target=self._post, args=(text,), daemon=True).start()

    def send(
        self,
        summary: str,
        severity: str = "info",
        title: Optional[str] = None,
        fields: Optional[dict] = None,
        detail: Optional[str] = None,
    ) -> None:
        emoji = _SEVERITY_EMOJI.get(severity, "⚪")
        lines: list[str] = [f"{emoji} *{title or 'PackGuardian'}*", summary]
        if fields:
            for k, v in fields.items():
                lines.append(f"*{k}:* {v}")
        if detail:
            lines.append(f"_{detail}_")
        lines.append(f"_{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_")
        self._fire("\n".join(lines))

    # ── Domain-specific event methods ─────────────────────────────────────────

    def incident_filed(
        self,
        incident_id,
        category: str,
        severity: str,
        center_id: Optional[str],
        reporter: str,
        recordable: Optional[bool] = None,
    ) -> None:
        sev_key = "high" if severity in ("high", "critical") else "medium"
        fields: dict = {
            "Category":    category.replace("_", " ").title(),
            "Severity":    severity.capitalize(),
            "Center":      center_id or "N/A",
            "Reporter":    reporter,
            "Incident ID": str(incident_id)[:8],
        }
        if recordable is not None:
            fields["OSHA Recordable"] = "Yes ⚠️" if recordable else "No"
        self.send(
            title="Incident Filed",
            summary="A new safety incident has been reported in PackGuardian.",
            severity=sev_key,
            fields=fields,
        )

    def osha_flagged(self, incident_id, osha_type: str, recordable: bool) -> None:
        self.send(
            title="OSHA Record Flagged",
            summary=f"Incident classified as {'*OSHA Recordable*' if recordable else 'non-recordable'}.",
            severity="high" if recordable else "info",
            fields={
                "OSHA Type":   osha_type or "N/A",
                "Recordable":  "Yes ⚠️" if recordable else "No",
                "Incident ID": str(incident_id)[:8],
            },
        )

    def case_escalated(
        self,
        case_id,
        case_type: str,
        priority: str,
        escalated_by: str,
    ) -> None:
        self.send(
            title="Case Escalated",
            summary=f"Safety case escalated to *{priority.upper()}* priority.",
            severity="high",
            fields={
                "Type":         case_type.replace("_", " ").title(),
                "Priority":     priority.upper(),
                "Escalated by": escalated_by,
                "Case ID":      str(case_id)[:8],
            },
        )

    def case_closed(self, case_id, case_type: str, closed_by: str) -> None:
        self.send(
            title="Case Closed",
            summary="A PackGuardian safety case has been resolved.",
            severity="success",
            fields={
                "Type":      case_type.replace("_", " ").title(),
                "Closed by": closed_by,
                "Case ID":   str(case_id)[:8],
            },
        )

    def corrective_action_created(self, ca_id, description: str, due_date: Optional[str], owner: str) -> None:
        self.send(
            title="Corrective Action Created",
            summary="A new corrective action has been logged.",
            severity="medium",
            fields={
                "Action":  description[:80] + ("…" if len(description) > 80 else ""),
                "Owner":   owner,
                "Due":     due_date or "Not set",
                "CA ID":   str(ca_id)[:8],
            },
        )

    def demo_seeded(self, incidents: int, cases: int, centers: int) -> None:
        self.send(
            title="Demo Data Seeded",
            summary="PackGuardian demo workspace has been populated with realistic data.",
            severity="info",
            fields={
                "Incidents": str(incidents),
                "Cases":     str(cases),
                "Centers":   str(centers),
            },
        )

    def tenant_onboarded(self, tenant_name: str, admin_email: str, is_trial: bool) -> None:
        self.send(
            title="New Tenant Onboarded 🎉",
            summary=f"A new organization has joined PackGuardian{'(trial)' if is_trial else ''}.",
            severity="success",
            fields={
                "Organization": tenant_name,
                "Admin":        admin_email,
                "Mode":         "Trial" if is_trial else "Full",
            },
        )

    def build_event(self, event: str, detail: Optional[str] = None) -> None:
        """Build/deploy lifecycle events — wired from start.sh or startup hook."""
        self.send(
            title=f"Build Event: {event}",
            summary=detail or event,
            severity="build",
        )


# Singleton
pg_slack = PackGuardianSlack()
