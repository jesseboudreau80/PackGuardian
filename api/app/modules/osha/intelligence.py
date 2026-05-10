"""
Rule-based incident intelligence engine.

Designed to be replaced or augmented with an LLM later — the IntelligenceResult
dataclass is the stable interface; only this file needs to change.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TypedDict


class ExplanationMeta(TypedDict):
    category_keywords: list[str]
    escalation_keywords: list[str]
    original_severity: str
    adjusted_severity: str

# ── Category rules ────────────────────────────────────────────────────────────
# Order matters: first match wins. Put more specific rules above broader ones.
_CATEGORY_RULES: list[tuple[frozenset[str], str]] = [
    (frozenset({"bite", "biting", "bitten", "attacked", "attack", "mauled"}), "Animal Bite"),
    (frozenset({"blood", "bleeding", "cut", "laceration", "wound", "gash", "lacerate"}), "Laceration / Bleeding"),
    (frozenset({"chemical", "bleach", "cleaner", "disinfectant", "fume", "fumes", "spray", "exposure", "inhaled", "ingested"}), "Chemical Exposure"),
    (frozenset({"burn", "burned", "scald", "scalded", "hot", "heat", "fire"}), "Burn Injury"),
    (frozenset({"slip", "slipped", "fall", "fell", "trip", "tripped", "stumble", "stumbled"}), "Slip & Fall"),
    (frozenset({"strain", "sprain", "lift", "lifting", "back", "muscle", "overexertion", "pulled", "twist", "twisted"}), "Musculoskeletal"),
    (frozenset({"scratch", "scratched", "claw", "clawed", "scrape", "scraped"}), "Animal Scratch"),
    (frozenset({"equipment", "tool", "machinery", "machine", "device", "equipment"}), "Equipment Hazard"),
    (frozenset({"near miss", "near-miss", "almost", "narrowly", "close call", "close-call"}), "Near Miss"),
]

# ── Escalation keywords ───────────────────────────────────────────────────────
# Any of these in the text bump severity up one level.
_ESCALATION_KEYWORDS: frozenset[str] = frozenset({
    "blood", "bleeding", "profuse", "hospital", "emergency", "911",
    "stitches", "stitched", "unconscious", "fainted", "faint", "ambulance",
    "severe", "deep", "serious", "fracture", "broken", "bone",
})

_SEVERITY_ORDER: list[str] = ["low", "medium", "high", "critical"]

# ── Risk scoring ──────────────────────────────────────────────────────────────
_BASE_RISK: dict[str, int] = {
    "low": 12,
    "medium": 38,
    "high": 65,
    "critical": 86,
}

_CATEGORY_BONUS: dict[str, int] = {
    "Animal Bite":          18,
    "Laceration / Bleeding": 12,
    "Chemical Exposure":    22,
    "Burn Injury":          18,
    "Slip & Fall":          10,
    "Musculoskeletal":       6,
    "Animal Scratch":        7,
    "Equipment Hazard":     14,
    "Near Miss":            -8,
    "General":               0,
}

# ── Recommendations ───────────────────────────────────────────────────────────
_RECOMMENDATIONS: dict[str, list[str]] = {
    "Animal Bite": [
        "Isolate the animal and verify vaccination records immediately",
        "Provide first aid and arrange medical evaluation for the employee",
        "Review animal handling SOPs with all staff",
        "File OSHA 300 log entry if the incident is recordable",
        "Conduct a behavior assessment of the animal with management",
    ],
    "Laceration / Bleeding": [
        "Apply first aid immediately; escalate to medical care if wound is deep",
        "Remove or guard the hazard that caused the laceration",
        "Review sharps handling and PPE requirements for the area",
        "Document wound details and treatment provided",
    ],
    "Chemical Exposure": [
        "Remove the employee from the area and provide fresh air",
        "Consult the SDS for the specific chemical involved",
        "Arrange medical evaluation if skin, eye, or inhalation exposure occurred",
        "Review chemical storage, labeling, and PPE requirements",
        "Ensure all staff complete chemical handling training",
    ],
    "Burn Injury": [
        "Cool the burn under running water for at least 10 minutes",
        "Arrange medical evaluation; do not apply ice or home remedies",
        "Identify the heat source and implement guards or warnings",
        "Review burn-risk tasks and update PPE requirements",
    ],
    "Slip & Fall": [
        "Identify and address the root cause of the slip hazard immediately",
        "Increase non-slip matting or signage in the affected area",
        "Review wet floor protocols and mop-up procedures with staff",
        "Inspect footwear requirements for staff working in wet areas",
    ],
    "Musculoskeletal": [
        "Arrange an ergonomic evaluation of the task or workstation",
        "Provide guidance on proper lifting techniques to all staff",
        "Assess whether assistive equipment (dollies, lifts) can eliminate the risk",
        "Schedule a follow-up check-in with the affected employee",
    ],
    "Animal Scratch": [
        "Clean the wound thoroughly with soap and water for 5 minutes",
        "Monitor for signs of infection over the next 48–72 hours",
        "Review animal handling and restraint techniques with staff",
        "Confirm tetanus vaccination status is current for the affected employee",
    ],
    "Equipment Hazard": [
        "Remove equipment from service until inspected and cleared",
        "Conduct a formal equipment inspection and document findings",
        "Review operating procedures and training records for the equipment",
        "Ensure all staff are trained on equipment safety protocols",
    ],
    "Near Miss": [
        "Document the near miss in detail — they reliably predict future injuries",
        "Identify and eliminate the root cause before work resumes",
        "Share the near miss report with the full team as a safety alert",
        "Review related procedures and update if necessary",
    ],
    "General": [
        "Document the incident thoroughly with photos if possible",
        "Identify root cause and implement corrective action",
        "Review relevant safety procedures with affected staff",
        "Schedule a team safety briefing to discuss the incident",
    ],
}

# How many recommendations to surface per severity level
_REC_COUNT: dict[str, int] = {"low": 2, "medium": 3, "high": 4, "critical": 5}


# ── Public interface ──────────────────────────────────────────────────────────

@dataclass
class IntelligenceResult:
    category: str
    adjusted_severity: str
    risk_score: int
    recommendations: list[str]
    explanation: str
    explanation_meta: ExplanationMeta


def analyze(incident_type: str, description: str, severity: str) -> IntelligenceResult:
    """
    Classify an incident and return enriched intelligence.
    Pure function — no I/O, no side effects.
    """
    tokens = _tokenize(f"{incident_type} {description}")

    category, category_keywords = _classify(tokens)
    adjusted_severity, escalation_keywords = _adjust_severity(tokens, severity)
    risk_score = _score(adjusted_severity, category, bool(escalation_keywords))
    recommendations = _recommend(category, adjusted_severity)
    explanation = _explain(
        category, category_keywords, severity, adjusted_severity, escalation_keywords
    )

    explanation_meta: ExplanationMeta = {
        "category_keywords": sorted(category_keywords),
        "escalation_keywords": sorted(escalation_keywords),
        "original_severity": severity,
        "adjusted_severity": adjusted_severity,
    }

    return IntelligenceResult(
        category=category,
        adjusted_severity=adjusted_severity,
        risk_score=risk_score,
        recommendations=recommendations,
        explanation=explanation,
        explanation_meta=explanation_meta,
    )


# ── Private helpers ───────────────────────────────────────────────────────────

def _tokenize(text: str) -> frozenset[str]:
    return frozenset(re.findall(r"[a-z]+(?:-[a-z]+)*", text.lower()))


def _classify(tokens: frozenset[str]) -> tuple[str, frozenset[str]]:
    for keywords, category in _CATEGORY_RULES:
        matched = keywords & tokens
        if matched:
            return category, matched
    return "General", frozenset()


def _adjust_severity(
    tokens: frozenset[str], severity: str
) -> tuple[str, frozenset[str]]:
    matched = _ESCALATION_KEYWORDS & tokens
    if not matched:
        return severity, frozenset()
    idx = _SEVERITY_ORDER.index(severity) if severity in _SEVERITY_ORDER else 0
    return _SEVERITY_ORDER[min(idx + 1, len(_SEVERITY_ORDER) - 1)], matched


def _score(severity: str, category: str, has_escalation: bool) -> int:
    base = _BASE_RISK.get(severity, 15)
    bonus = _CATEGORY_BONUS.get(category, 0)
    escalation = 8 if has_escalation else 0
    return max(1, min(100, base + bonus + escalation))


def _recommend(category: str, severity: str) -> list[str]:
    pool = _RECOMMENDATIONS.get(category, _RECOMMENDATIONS["General"])
    count = _REC_COUNT.get(severity, 3)
    return pool[:count]


def _explain(
    category: str,
    category_keywords: frozenset[str],
    original_severity: str,
    adjusted_severity: str,
    escalation_keywords: frozenset[str],
) -> str:
    parts: list[str] = []

    if category == "General":
        parts.append("No specific category matched — classified as General.")
    else:
        kw = ", ".join(sorted(category_keywords))
        noun = "keywords" if len(category_keywords) > 1 else "keyword"
        parts.append(f"Categorized as {category} based on {noun}: {kw}.")

    if escalation_keywords:
        kw = ", ".join(sorted(escalation_keywords))
        noun = "keywords" if len(escalation_keywords) > 1 else "keyword"
        if adjusted_severity != original_severity:
            parts.append(
                f"Severity escalated from {original_severity} to {adjusted_severity}"
                f" due to {noun}: {kw}."
            )
        else:
            parts.append(
                f"Escalation {noun} detected ({kw})"
                f" but severity is already at maximum ({original_severity})."
            )
    else:
        parts.append("No escalation keywords detected.")

    return " ".join(parts)
