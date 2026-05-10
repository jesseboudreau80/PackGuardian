import logging
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.organizations.access import OrgScope, apply_scope, get_org_scope

from .models import Incident
from .schemas import (
    EmergingRisk,
    KeywordCluster,
    KeywordCount,
    PatternAnalysis,
    RecommendedAction,
    SeverityTransition,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["Analytics"])

_TOP_N = 5
_TOP_ACTIONS = 3

# ── Keyword → recommended action mapping ─────────────────────────────────────
# Synonyms intentionally map to the same action string; deduplication handles
# the case where multiple synonyms appear in the same top-keyword list.
_KEYWORD_ACTIONS: dict[str, str] = {
    # Animal bite
    "bite":     "Review dog grouping procedures and handler supervision protocols",
    "bitten":   "Review dog grouping procedures and handler supervision protocols",
    "biting":   "Review dog grouping procedures and handler supervision protocols",
    "attacked": "Review animal aggression assessment and handler safety procedures",
    "mauled":   "Review animal aggression assessment and handler safety procedures",
    # Scratch
    "scratch":   "Retrain staff on animal restraint and nail management protocols",
    "scratched": "Retrain staff on animal restraint and nail management protocols",
    "claw":      "Retrain staff on animal restraint and nail management protocols",
    "clawed":    "Retrain staff on animal restraint and nail management protocols",
    "scrape":    "Retrain staff on animal restraint and nail management protocols",
    "scraped":   "Retrain staff on animal restraint and nail management protocols",
    # Slip / fall
    "slip":     "Inspect flooring surfaces and wet-area cleaning procedures",
    "slipped":  "Inspect flooring surfaces and wet-area cleaning procedures",
    "fall":     "Audit trip hazards and enforce non-slip footwear policy",
    "fell":     "Audit trip hazards and enforce non-slip footwear policy",
    "trip":     "Audit trip hazards and enforce non-slip footwear policy",
    "tripped":  "Audit trip hazards and enforce non-slip footwear policy",
    "stumble":  "Audit trip hazards and enforce non-slip footwear policy",
    "stumbled": "Audit trip hazards and enforce non-slip footwear policy",
    # Laceration / bleeding
    "cut":        "Inspect sharp surfaces and edges; enforce cut-resistant glove policy",
    "laceration": "Inspect sharp surfaces and edges; enforce cut-resistant glove policy",
    "lacerate":   "Inspect sharp surfaces and edges; enforce cut-resistant glove policy",
    "gash":       "Inspect sharp surfaces and edges; enforce cut-resistant glove policy",
    "wound":      "Inspect sharp surfaces and edges; enforce cut-resistant glove policy",
    "blood":      "Review injury response protocols and first-aid kit availability",
    "bleeding":   "Review injury response protocols and first-aid kit availability",
    "profuse":    "Review injury response protocols and first-aid kit availability",
    # Chemical exposure
    "chemical":     "Review chemical storage, labeling, and PPE requirements",
    "bleach":       "Review bleach dilution ratios and ventilation procedures",
    "cleaner":      "Review chemical storage, labeling, and PPE requirements",
    "disinfectant": "Review chemical storage, labeling, and PPE requirements",
    "fume":         "Improve ventilation in chemical-use areas and enforce respirator policy",
    "fumes":        "Improve ventilation in chemical-use areas and enforce respirator policy",
    "exposure":     "Audit PPE compliance and refresh chemical hazard training",
    "inhaled":      "Improve ventilation in chemical-use areas and enforce respirator policy",
    "ingested":     "Review chemical storage security and enforce closed-container policy",
    # Burn
    "burn":   "Audit heat sources and enforce burn-prevention PPE requirements",
    "burned": "Audit heat sources and enforce burn-prevention PPE requirements",
    "scald":  "Review hot water and steam handling procedures",
    "scalded":"Review hot water and steam handling procedures",
    # Musculoskeletal
    "strain":       "Conduct ergonomic assessment of high-lift and repetitive-motion tasks",
    "sprain":       "Conduct ergonomic assessment of high-lift and repetitive-motion tasks",
    "lift":         "Retrain staff on proper lifting technique and enforce weight limits",
    "lifting":      "Retrain staff on proper lifting technique and enforce weight limits",
    "overexertion": "Assess workload distribution and introduce mechanical lifting aids",
    "back":         "Conduct ergonomic assessment of high-lift and repetitive-motion tasks",
    "muscle":       "Conduct ergonomic assessment of high-lift and repetitive-motion tasks",
    "pulled":       "Conduct ergonomic assessment of high-lift and repetitive-motion tasks",
    "twist":        "Conduct ergonomic assessment of high-lift and repetitive-motion tasks",
    "twisted":      "Conduct ergonomic assessment of high-lift and repetitive-motion tasks",
    # Equipment
    "equipment": "Schedule equipment inspection and update operating procedures",
    "tool":      "Schedule equipment inspection and update operating procedures",
    "machinery": "Conduct formal machinery risk assessment and retrain operators",
    "machine":   "Conduct formal machinery risk assessment and retrain operators",
    # Near miss
    "near":    "Investigate near-miss root cause and share findings with all staff",
    "almost":  "Investigate near-miss root cause and share findings with all staff",
    "narrowly":"Investigate near-miss root cause and share findings with all staff",
    # Escalation triggers
    "hospital":    "Review emergency response procedures and maintain updated staff contacts",
    "emergency":   "Review emergency response procedures and maintain updated staff contacts",
    "911":         "Review emergency response procedures and maintain updated staff contacts",
    "ambulance":   "Review emergency response procedures and maintain updated staff contacts",
    "stitches":    "Review injury escalation protocols and ensure supervisor notification steps are clear",
    "stitched":    "Review injury escalation protocols and ensure supervisor notification steps are clear",
    "unconscious": "Conduct immediate emergency response training refresher for all staff",
    "fainted":     "Conduct immediate emergency response training refresher for all staff",
    "faint":       "Conduct immediate emergency response training refresher for all staff",
    "severe":      "Audit incident severity thresholds and the escalation reporting chain",
    "deep":        "Review injury response protocols and first-aid kit availability",
    "serious":     "Audit incident severity thresholds and the escalation reporting chain",
    "fracture":    "Conduct fall-prevention audit and update emergency response protocols",
    "broken":      "Conduct fall-prevention audit and update emergency response protocols",
    "bone":        "Conduct fall-prevention audit and update emergency response protocols",
}


@router.get("/patterns", response_model=PatternAnalysis)
def get_patterns(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> PatternAnalysis:
    try:
        incidents = (
            apply_scope(db.query(Incident), scope, current_user.tenant_id)
            .filter(Incident.explanation_meta.isnot(None))
            .all()
        )

        cat_kw_counter: Counter[str] = Counter()
        esc_kw_counter: Counter[str] = Counter()
        transition_counter: Counter[tuple[str, str]] = Counter()
        # keyword → {incident_count, categories seen}
        cluster_data: dict[str, dict] = defaultdict(
            lambda: {"incident_count": 0, "categories": set()}
        )

        for inc in incidents:
            meta = inc.explanation_meta
            if not isinstance(meta, dict):
                continue

            cat_keywords: list[str] = meta.get("category_keywords") or []
            esc_keywords: list[str] = meta.get("escalation_keywords") or []
            orig_sev: str = meta.get("original_severity", "")
            adj_sev: str = meta.get("adjusted_severity", "")

            for kw in cat_keywords:
                cat_kw_counter[kw] += 1
                cluster_data[kw]["incident_count"] += 1
                if inc.category:
                    cluster_data[kw]["categories"].add(inc.category)

            for kw in esc_keywords:
                esc_kw_counter[kw] += 1

            if orig_sev and adj_sev and orig_sev != adj_sev:
                transition_counter[(orig_sev, adj_sev)] += 1

        top_cat_kw = [
            KeywordCount(keyword=kw, count=cnt)
            for kw, cnt in cat_kw_counter.most_common(_TOP_N)
        ]
        top_esc_kw = [
            KeywordCount(keyword=kw, count=cnt)
            for kw, cnt in esc_kw_counter.most_common(_TOP_N)
        ]
        transitions = [
            SeverityTransition(from_severity=f, to_severity=t, count=cnt)
            for (f, t), cnt in transition_counter.most_common(_TOP_N)
        ]
        keyword_clusters = [
            KeywordCluster(
                keyword=kw,
                incident_count=data["incident_count"],
                categories=sorted(data["categories"]),
            )
            for kw, data in sorted(
                cluster_data.items(), key=lambda x: -x[1]["incident_count"]
            )
        ][:_TOP_N]

        total_with_meta = len(incidents)
        now = datetime.now(timezone.utc)
        summary = _build_summary(top_cat_kw, top_esc_kw, transitions)
        recommended_actions = _recommend_actions(
            top_cat_kw, top_esc_kw, transitions, total_with_meta
        )
        emerging_risks = _detect_emerging_risks(incidents, now)

        return PatternAnalysis(
            top_category_keywords=top_cat_kw,
            top_escalation_keywords=top_esc_kw,
            severity_transitions=transitions,
            keyword_clusters=keyword_clusters,
            summary=summary,
            recommended_actions=recommended_actions,
            emerging_risks=emerging_risks,
        )
    except Exception as exc:
        logger.exception("Failed to compute pattern analysis")
        raise HTTPException(status_code=500, detail="Failed to compute pattern analysis") from exc


def _build_summary(
    cat_kw: list[KeywordCount],
    esc_kw: list[KeywordCount],
    transitions: list[SeverityTransition],
) -> str:
    if not cat_kw and not esc_kw:
        return "No pattern data available yet — add more incidents to surface trends."

    parts: list[str] = []

    if cat_kw:
        top = cat_kw[0].keyword
        parts.append(f"Most incidents are driven by '{top}'-related behavior")

    if esc_kw:
        top = esc_kw[0].keyword
        if parts:
            parts[0] += f", with frequent escalation due to '{top}' exposure"
        else:
            parts.append(f"Frequent escalation triggered by '{top}' exposure")

    if transitions:
        t = transitions[0]
        parts.append(
            f"Most common severity escalation: {t.from_severity} → {t.to_severity}"
            f" ({t.count} incident{'s' if t.count != 1 else ''})"
        )

    return ". ".join(parts) + "."


def _recommend_actions(
    cat_kw: list[KeywordCount],
    esc_kw: list[KeywordCount],
    transitions: list[SeverityTransition],
    total_incidents: int,
) -> list[RecommendedAction]:
    """
    Walk category keywords then escalation keywords in frequency order.
    For each unique action string, compute confidence and priority.

    Confidence: keyword frequency / total incidents with meta (capped at 1.0).
    Priority:   scoring based on keyword source and severity transition context.
    """
    seen: set[str] = set()
    actions: list[RecommendedAction] = []

    for from_escalation, kw_list in ((False, cat_kw), (True, esc_kw)):
        for item in kw_list:
            action_str = _KEYWORD_ACTIONS.get(item.keyword)
            if not action_str or action_str in seen:
                continue
            seen.add(action_str)
            actions.append(
                RecommendedAction(
                    action=action_str,
                    confidence=round(min(1.0, item.count / max(1, total_incidents)), 2),
                    priority=_priority(from_escalation, transitions),
                )
            )
            if len(actions) >= _TOP_ACTIONS:
                return actions

    return actions


def _priority(
    from_escalation: bool,
    transitions: list[SeverityTransition],
) -> str:
    """
    Score = escalation source (0 or 2) + transition present (1) + to_critical (+1).
    3+ → high | 1–2 → medium | 0 → low
    """
    score = 2 if from_escalation else 0
    if transitions:
        score += 1
    if any(t.to_severity == "critical" for t in transitions):
        score += 1
    if score >= 3:
        return "high"
    if score >= 1:
        return "medium"
    return "low"


_TREND_ORDER = {"increasing": 0, "stable": 1, "decreasing": 2}
_RISK_ORDER   = {"high": 0, "medium": 1, "low": 2}


def _detect_emerging_risks(incidents: list, now: datetime) -> list[EmergingRisk]:
    """
    Compare keyword frequencies in the last 7 days vs the prior 7 days.
    Returns up to _TOP_N keywords sorted by trend urgency then risk level.
    """
    recent_cutoff   = now - timedelta(days=7)
    previous_cutoff = now - timedelta(days=14)

    # keyword → incident-occurrence count per window
    recent_kw: Counter[str] = Counter()
    prev_kw:   Counter[str] = Counter()

    # keyword → effective severities seen in the recent window
    recent_sev:  dict[str, set[str]] = defaultdict(set)
    # keywords that appeared as escalation keywords in the recent window
    recent_esc: set[str] = set()

    for inc in incidents:
        meta = inc.explanation_meta
        if not isinstance(meta, dict):
            continue

        ts = inc.created_at
        if ts.tzinfo is None:  # defensive: normalise naive datetimes
            ts = ts.replace(tzinfo=timezone.utc)

        cat_kws: list[str] = meta.get("category_keywords") or []
        esc_kws: list[str] = meta.get("escalation_keywords") or []
        all_kws = set(cat_kws) | set(esc_kws)

        effective_sev: str = inc.adjusted_severity or inc.reported_severity

        if ts >= recent_cutoff:
            for kw in all_kws:
                recent_kw[kw] += 1
                recent_sev[kw].add(effective_sev)
            recent_esc.update(esc_kws)
        elif ts >= previous_cutoff:
            for kw in all_kws:
                prev_kw[kw] += 1

    all_keywords = set(recent_kw) | set(prev_kw)
    if not all_keywords:
        return []

    results: list[tuple[EmergingRisk, tuple]] = []

    for kw in all_keywords:
        r_count = recent_kw[kw]
        p_count = prev_kw[kw]

        if r_count > p_count:
            trend: str = "increasing"
        elif r_count < p_count:
            trend = "decreasing"
        else:
            trend = "stable"

        is_high_sev   = bool(recent_sev.get(kw, set()) & {"high", "critical"})
        is_esc_keyword = kw in recent_esc

        if trend == "increasing" and (is_high_sev or is_esc_keyword):
            risk_level: str = "high"
        elif trend == "increasing":
            risk_level = "medium"
        else:
            risk_level = "low"

        sort_key = (
            _TREND_ORDER[trend],
            _RISK_ORDER[risk_level],
            -r_count,   # higher recent frequency = more urgent within same bucket
        )
        results.append((EmergingRisk(keyword=kw, trend=trend, risk_level=risk_level), sort_key))

    results.sort(key=lambda x: x[1])
    return [risk for risk, _ in results[:_TOP_N]]
