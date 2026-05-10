"""
Heat score computation for the Risk Intelligence Map.
Pure functions — no I/O, no FastAPI, no SQLAlchemy.
"""
from __future__ import annotations

import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.modules.osha.models import Incident

_SEVERITY_WEIGHT: dict[str, float] = {
    "critical": 100.0,
    "high":      75.0,
    "medium":    50.0,
    "low":       25.0,
}

# Keyword → recommended action (abridged — mirrors analytics._KEYWORD_ACTIONS)
_KEYWORD_ACTIONS: dict[str, str] = {
    "bite":       "Review dog grouping procedures and handler supervision protocols",
    "bitten":     "Review dog grouping procedures and handler supervision protocols",
    "biting":     "Review dog grouping procedures and handler supervision protocols",
    "attacked":   "Review animal aggression assessment and handler safety procedures",
    "scratch":    "Retrain staff on animal restraint and nail management protocols",
    "scratched":  "Retrain staff on animal restraint and nail management protocols",
    "slip":       "Inspect flooring surfaces and wet-area cleaning procedures",
    "slipped":    "Inspect flooring surfaces and wet-area cleaning procedures",
    "fall":       "Audit trip hazards and enforce non-slip footwear policy",
    "fell":       "Audit trip hazards and enforce non-slip footwear policy",
    "cut":        "Inspect sharp surfaces and edges; enforce cut-resistant glove policy",
    "laceration": "Inspect sharp surfaces and edges; enforce cut-resistant glove policy",
    "blood":      "Review injury response protocols and first-aid kit availability",
    "bleeding":   "Review injury response protocols and first-aid kit availability",
    "chemical":   "Review chemical storage, labeling, and PPE requirements",
    "bleach":     "Review bleach dilution ratios and ventilation procedures",
    "fume":       "Improve ventilation in chemical-use areas and enforce respirator policy",
    "fumes":      "Improve ventilation in chemical-use areas and enforce respirator policy",
    "burn":       "Audit heat sources and enforce burn-prevention PPE requirements",
    "strain":     "Conduct ergonomic assessment of high-lift and repetitive-motion tasks",
    "lift":       "Retrain staff on proper lifting technique and enforce weight limits",
    "lifting":    "Retrain staff on proper lifting technique and enforce weight limits",
    "equipment":  "Schedule equipment inspection and update operating procedures",
    "hospital":   "Review emergency response procedures and maintain updated staff contacts",
    "emergency":  "Review emergency response procedures and maintain updated staff contacts",
    "fracture":   "Conduct fall-prevention audit and update emergency response protocols",
    "broken":     "Conduct fall-prevention audit and update emergency response protocols",
}


def _effective_severity(incident) -> str:
    return incident.adjusted_severity or incident.reported_severity


def compute_heat(incidents: list, now: datetime | None = None) -> dict:
    """
    Return a dict with heat_score, emerging_risk_level, trend_velocity,
    top_drivers, recommended_actions, avg_risk_score, osha_recordable_count.
    """
    if not incidents:
        return {
            "avg_risk_score": 0.0,
            "heat_score": 0.0,
            "emerging_risk_level": "low",
            "trend_velocity": 0.0,
            "top_drivers": [],
            "recommended_actions": [],
            "osha_recordable_count": 0,
        }

    if now is None:
        now = datetime.now(timezone.utc)

    n = len(incidents)

    # ── Component 1: average risk score (0–100) ───────────────────────────────
    scored = [i.risk_score for i in incidents if i.risk_score is not None]
    avg_risk = sum(scored) / len(scored) if scored else 0.0

    # ── Component 2: average severity weight (0–100) ──────────────────────────
    sev_scores = [_SEVERITY_WEIGHT.get(_effective_severity(i), 25.0) for i in incidents]
    avg_sev = sum(sev_scores) / n

    # ── Component 3: open incident ratio (0–100) ──────────────────────────────
    open_count = sum(1 for i in incidents if i.status == "open")
    open_ratio = (open_count / n) * 100.0

    # ── Component 4: trend velocity score (0–100) ─────────────────────────────
    half = timedelta(days=15)
    recent_cutoff = now - half
    prev_cutoff = now - 2 * half

    recent_n = sum(1 for i in incidents if _ts(i) >= recent_cutoff)
    prev_n = sum(1 for i in incidents if prev_cutoff <= _ts(i) < recent_cutoff)

    trend_velocity = (recent_n - prev_n) / max(prev_n, 1)
    # Map velocity to 0–100: -1.0 → 0, 0 → 50, +1.0 → 75, +2.0 → 100
    vel_score = min(100.0, max(0.0, (trend_velocity + 1.0) * 40.0))

    # ── Composite heat score ───────────────────────────────────────────────────
    heat_score = round(
        avg_risk * 0.45
        + avg_sev  * 0.25
        + open_ratio * 0.15
        + vel_score  * 0.15,
        1,
    )
    heat_score = min(100.0, max(0.0, heat_score))

    if heat_score >= 65:
        emerging_risk_level = "high"
    elif heat_score >= 35:
        emerging_risk_level = "medium"
    else:
        emerging_risk_level = "low"

    # ── Top drivers: most frequent categories ─────────────────────────────────
    cat_counter: Counter[str] = Counter(
        i.category for i in incidents if i.category and i.category != "General"
    )
    top_drivers = [cat for cat, _ in cat_counter.most_common(3)]

    # ── Recommended actions from keyword frequency ────────────────────────────
    kw_counter: Counter[str] = Counter()
    for inc in incidents:
        meta = inc.explanation_meta
        if isinstance(meta, dict):
            for kw in (meta.get("category_keywords") or []) + (meta.get("escalation_keywords") or []):
                kw_counter[kw] += 1

    seen_actions: set[str] = set()
    recommended_actions: list[str] = []
    for kw, _ in kw_counter.most_common():
        action = _KEYWORD_ACTIONS.get(kw)
        if action and action not in seen_actions:
            seen_actions.add(action)
            recommended_actions.append(action)
            if len(recommended_actions) == 3:
                break

    osha_recordable_count = sum(1 for i in incidents if i.recordable)

    return {
        "avg_risk_score": round(avg_risk, 1),
        "heat_score": heat_score,
        "emerging_risk_level": emerging_risk_level,
        "trend_velocity": round(trend_velocity, 2),
        "top_drivers": top_drivers,
        "recommended_actions": recommended_actions,
        "osha_recordable_count": osha_recordable_count,
    }


def _ts(incident) -> datetime:
    ts = incident.created_at
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z]+", text.lower()))
