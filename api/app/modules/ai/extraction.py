"""
Incident intelligence extraction pipeline.

Architecture:
- If ANTHROPIC_API_KEY is set: uses Claude (claude-haiku-4-5-20251001) for extraction.
- Otherwise: falls back to the enhanced rule-based extractor (production-safe).

The ExtractionResult schema is the stable contract between the intake UI and
whatever extraction backend is active. Switching to Claude is purely additive.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ── Output schema ─────────────────────────────────────────────────────────────

@dataclass
class ExtractionResult:
    incident_type: str          # canonical key matching intake types
    severity: str               # low | medium | high | critical
    confidence: float           # 0.0 – 1.0
    extracted_fields: dict      # {skin_broken, treatment_type, body_part, ...}
    missing_fields: list[str]   # question IDs that are unanswered but important
    follow_up_prompts: list[str] # human-readable questions for the reporter
    osha_flag: bool             # likely OSHA-recordable under 29 CFR 1904
    osha_reason: str | None     # plain-language reason if flagged
    summary: str                # 1–2 sentence summary of what was captured


# ── OSHA recordability logic ──────────────────────────────────────────────────

_RECORDABLE_TREATMENTS = {"medical", "emergency_room", "hospitalization"}

def evaluate_osha_recordability(
    incident_type: str,
    treatment_type: str | None,
    restricted_duty: str | None,
    lost_time: str | None,
    description: str,
) -> tuple[bool, str | None]:
    """
    Evaluate whether an incident is likely OSHA-recordable under 29 CFR 1904.

    Returns (is_likely_recordable, reason_or_none).
    This is a RECOMMENDATION only — final determination is made by a qualified person.
    """
    if incident_type not in (
        "employee_injury", "slip_fall", "chemical", "dog_bite", "grooming"
    ):
        return False, None

    desc = description.lower()

    # Medical treatment beyond first aid → recordable
    if treatment_type in _RECORDABLE_TREATMENTS:
        label = {"medical": "clinic/urgent care", "emergency_room": "emergency room",
                 "hospitalization": "hospital admission"}.get(treatment_type, treatment_type)
        return True, f"Medical treatment beyond first aid ({label}) is an OSHA recordability criterion."

    # Restricted duty → recordable
    if restricted_duty == "yes":
        return True, "Restricted work duty is an OSHA recordability criterion."

    # Lost time → recordable
    if lost_time == "yes":
        return True, "Days away from work is an OSHA recordability criterion."

    # Keyword escalation in description
    stitches_patterns = r"\bstitches?\b|\bsutures?\b|\bfracture\b|\bbroken bone\b|\bhospital\b|\bambulanc"
    if re.search(stitches_patterns, desc):
        return True, "Description contains indicators of treatment beyond first aid (stitches, fracture, or hospitalization)."

    return False, None


# ── Rule-based extractor (production fallback) ────────────────────────────────

_TYPE_PATTERNS: list[tuple[re.Pattern, str, str]] = [
    (re.compile(r"bite|bit\b|bitten|biting|puncture.*skin|broke.*skin|skin.*broke", re.I), "dog_bite", "high"),
    (re.compile(r"dog.fight|fight.*dog|fight.*between|dogs.fighting|altercation.*dog", re.I), "dog_fight", "high"),
    (re.compile(r"slip|slipp|fell\b|fall\b|trip\b|tripped|stumble", re.I), "slip_fall", "medium"),
    (re.compile(r"chemical|bleach|cleaner|disinfect|exposure|fume|spray|inhal|ingest.*chemical", re.I), "chemical", "high"),
    (re.compile(r"groom|grooming|dryer|table.*fall|restraint.*groom|scissor|clipper", re.I), "grooming", "medium"),
    (re.compile(r"escape|loose|got out|ran out|missing.*dog|lost.*dog|dog.*loose", re.I), "escape", "high"),
    (re.compile(r"near.miss|close.call|almost|narrowly.avoided|near accident", re.I), "near_miss", "medium"),
    (re.compile(r"aggress|lunge|growl|snap|snarl|bark.*aggressive|charge.*dog", re.I), "aggressive_behavior", "medium"),
    (re.compile(r"damage|broken|flood|leak|fire|structural|ceiling|wall|equipment.*fail", re.I), "facility_damage", "medium"),
    (re.compile(r"injur|hurt|pain|strain|sprain|lift.*back|back.*lift|muscle|overexert", re.I), "employee_injury", "high"),
]

_SEVERITY_ESCALATORS = re.compile(
    r"emergency|911|hospital|ambulance|stitches?|sutures?|fracture|broken bone|"
    r"bleeding.*profuse|unconscious|critical|deep.wound|surgery", re.I
)
_SEVERITY_DE_ESCALATORS = re.compile(r"minor|small|scratch|little|superficial|no.treatment|fine", re.I)

# Questions that matter for each type, ordered by importance
_REQUIRED_FIELDS: dict[str, list[str]] = {
    "dog_bite": ["skin_broken", "who_injured", "treatment_type", "dog_separated", "witnesses"],
    "dog_fight": ["injuries_to_people", "dogs_separated", "vet_needed", "prior_history"],
    "employee_injury": ["body_part", "treatment_type", "restricted_duty", "witnesses"],
    "slip_fall": ["surface", "body_part", "treatment_type", "restricted_duty"],
    "chemical": ["sds_reviewed", "ppe_worn", "exposure_type", "treatment_type"],
    "grooming": ["injury_occurred", "body_part", "treatment_type", "equipment_involved"],
    "escape": ["recovered", "public_area", "owner_notified"],
    "near_miss": ["hazard_type", "workers_exposed", "corrective_action_taken"],
    "aggressive_behavior": ["dog_separated", "injuries_to_people", "prior_history"],
    "facility_damage": ["injury_occurred", "area_isolated", "cause_identified"],
    "employee_injury": ["body_part", "treatment_type", "restricted_duty", "witnesses"],
}

_PROMPTS: dict[str, str] = {
    "skin_broken":        "Was the skin broken (puncture, laceration, or bleeding)?",
    "who_injured":        "Who was injured — a team member or a guest?",
    "treatment_type":     "What level of medical treatment was provided or needed?",
    "dog_separated":      "Were the dog(s) separated and secured?",
    "dogs_separated":     "Were both dogs separated and secured after the incident?",
    "witnesses":          "Were there witnesses present?",
    "injuries_to_people": "Were any people injured while intervening?",
    "vet_needed":         "Does any animal require veterinary care?",
    "prior_history":      "Is there a known history of aggression with this animal?",
    "body_part":          "Which body part was affected?",
    "restricted_duty":    "Will this result in restricted duty or lost work time?",
    "surface":            "What caused the slip or fall (wet floor, obstacle, uneven surface)?",
    "sds_reviewed":       "Was the SDS (Safety Data Sheet) reviewed for the chemical involved?",
    "ppe_worn":           "Was appropriate PPE (gloves, goggles) in use at the time?",
    "exposure_type":      "What type of exposure occurred — skin, eye, inhaled, or ingested?",
    "recovered":          "Has the animal been recovered?",
    "public_area":        "Did the animal reach a public or street area?",
    "owner_notified":     "Has the owner been contacted?",
    "injury_occurred":    "Did anyone get injured?",
    "equipment_involved": "What equipment or tool was involved?",
    "hazard_type":        "What type of hazard caused the near miss?",
    "workers_exposed":    "How many team members were exposed to the hazard?",
    "corrective_action_taken": "Has corrective action been taken to eliminate the hazard?",
    "area_isolated":      "Has the affected area been isolated or closed off?",
    "cause_identified":   "Has the cause of the damage been identified?",
}


def _rule_based_extract(text: str, hint_type: str | None) -> ExtractionResult:
    """Enhanced rule-based extraction with OSHA evaluation and missing-field detection."""
    # Classify type
    incident_type = hint_type or "general"
    confidence = 0.55 if hint_type else 0.45

    for pattern, itype, _ in _TYPE_PATTERNS:
        if pattern.search(text):
            incident_type = itype
            confidence = 0.70
            break

    # Assess severity
    if _SEVERITY_ESCALATORS.search(text):
        severity = "critical" if re.search(r"unconscious|911|surgery|fracture", text, re.I) else "high"
    elif _SEVERITY_DE_ESCALATORS.search(text):
        severity = "low"
    else:
        severity = {"dog_bite": "high", "dog_fight": "high", "chemical": "high",
                    "escape": "high", "employee_injury": "high",
                    "slip_fall": "medium", "grooming": "medium",
                    "near_miss": "medium", "aggressive_behavior": "medium",
                    "facility_damage": "medium"}.get(incident_type, "medium")

    # Extract fields from text
    extracted: dict = {}
    text_lower = text.lower()

    if re.search(r"skin.broke|broke.skin|puncture|lacerat|bleed|blood", text_lower):
        extracted["skin_broken"] = "yes"
    if re.search(r"no.skin|skin.intact|no.break|superficial", text_lower):
        extracted["skin_broken"] = "no"

    if re.search(r"hospital.*admitt|admitt.*hospital|overnight.*hospital|hospital.*overnight", text_lower):
        extracted["treatment_type"] = "hospitalization"
    elif re.search(r"emergency.room|\ber\b|e\.r\.|ambulance|called.911|\b911\b", text_lower):
        extracted["treatment_type"] = "emergency_room"
    elif re.search(r"urgent.care|doctor|clinic|physician|went to.*care", text_lower):
        extracted["treatment_type"] = "medical"
    elif re.search(r"first.aid|bandage|ice.pack|band.aid|no.*treatment|not.treated|cleaned.it|washed.it", text_lower):
        extracted["treatment_type"] = "first_aid"

    if re.search(r"separated|put.away|isolated|kennel", text_lower):
        extracted["dog_separated"] = "yes"
    if re.search(r"witness|saw.it|was.there|present", text_lower):
        extracted["witnesses"] = "yes"
    if re.search(r"restrict|light.duty|modified.duty|can't.work|cannot.work", text_lower):
        extracted["restricted_duty"] = "yes"

    for pattern, part in [
        (r"\bback\b|\bspine\b|\blumbar", "back"),
        (r"\bhand\b|\bfinger\b|\bwrist\b", "hand_finger"),
        (r"\barm\b|\bshoulder\b|\belbow\b", "arm_shoulder"),
        (r"\bleg\b|\bknee\b|\bankle\b|\bfoot\b", "leg_knee"),
        (r"\bhead\b|\bneck\b|\bface\b|\beye\b", "head_neck"),
    ]:
        if re.search(pattern, text_lower):
            extracted["body_part"] = part
            break

    # Determine missing fields and prompts
    required = _REQUIRED_FIELDS.get(incident_type, [])
    missing = [f for f in required if f not in extracted]
    follow_ups = [_PROMPTS[f] for f in missing[:4] if f in _PROMPTS]

    # OSHA evaluation
    osha_flag, osha_reason = evaluate_osha_recordability(
        incident_type,
        extracted.get("treatment_type"),
        extracted.get("restricted_duty"),
        extracted.get("lost_time"),
        text,
    )

    # Build summary
    type_label = incident_type.replace("_", " ").title()
    summary_parts = [f"Detected: {type_label} incident ({severity} severity)."]
    if extracted.get("treatment_type"):
        summary_parts.append(f"Treatment: {extracted['treatment_type'].replace('_', ' ')}.")
    if osha_flag:
        summary_parts.append("May be OSHA recordable — please review.")
    if missing:
        summary_parts.append(f"{len(missing)} follow-up question(s) recommended.")

    return ExtractionResult(
        incident_type=incident_type,
        severity=severity,
        confidence=confidence,
        extracted_fields=extracted,
        missing_fields=missing,
        follow_up_prompts=follow_ups,
        osha_flag=osha_flag,
        osha_reason=osha_reason,
        summary=" ".join(summary_parts),
    )


# ── Claude-powered extractor ──────────────────────────────────────────────────

_EXTRACTION_SYSTEM = """\
You are an incident intelligence engine for PackGuardian, an operational safety platform
for multi-location pet care businesses (kennels, daycares, groomers, boarding, vet clinics).

Your task: parse a natural-language incident description and extract structured data.

Respond ONLY with valid JSON matching this exact schema:
{
  "incident_type": "<one of: dog_bite | dog_fight | employee_injury | slip_fall | chemical | grooming | escape | near_miss | aggressive_behavior | facility_damage | general>",
  "severity": "<one of: low | medium | high | critical>",
  "confidence": <float 0.0-1.0>,
  "extracted_fields": {
    "skin_broken": "<yes | no | null>",
    "who_injured": "<employee | guest | dog_only | null>",
    "treatment_type": "<none | first_aid | medical | emergency_room | hospitalization | null>",
    "body_part": "<back | hand_finger | arm_shoulder | leg_knee | head_neck | other | null>",
    "dog_separated": "<yes | no | null>",
    "witnesses": "<yes | no | null>",
    "restricted_duty": "<yes | no | null>",
    "vet_needed": "<yes | no | null>",
    "dogs_involved": "<description or null>",
    "exposure_type": "<skin | eyes | inhaled | ingested | null>",
    "recovered": "<yes | no | null>"
  },
  "missing_fields": ["<list of field names that are important but not answerable from the text>"],
  "follow_up_prompts": ["<2-4 specific questions to ask the reporter to complete the report>"],
  "osha_flag": <true | false>,
  "osha_reason": "<plain-language reason if flagged, else null>",
  "summary": "<1-2 sentence plain-language summary of what was captured>"
}

OSHA RECORDABILITY CRITERIA (29 CFR 1904):
Flag osha_flag=true for EMPLOYEE injuries that involve ANY of:
- Medical treatment beyond first aid (clinic, ER, hospitalization)
- Days away from work
- Restricted or transferred work duties
- Loss of consciousness
- Diagnosis of a significant injury by a healthcare professional

Do NOT flag for pet-only injuries, guest injuries (different reporting system),
or incidents with first-aid-only treatment.

SEVERITY GUIDANCE:
- critical: life-threatening, 911 called, hospital admission, unconscious
- high: ER visit, deep wound, multiple animals involved, serious injury
- medium: clinic/urgent care, moderate injury, moderate hazard
- low: first aid only, minor scratch, no injury, near miss

Be conservative — when uncertain, prefer a higher severity.
"""

_EXTRACTION_PROMPT = "Extract structured incident data from this report:\n\n{text}"


def _claude_extract(text: str, api_key: str) -> ExtractionResult:
    """Use Claude to extract structured incident data."""
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=_EXTRACTION_SYSTEM,
            messages=[{"role": "user", "content": _EXTRACTION_PROMPT.format(text=text[:4000])}],
        )

        raw = message.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()

        data = json.loads(raw)

        ef = data.get("extracted_fields", {})
        osha_flag = data.get("osha_flag", False)
        osha_reason = data.get("osha_reason") if osha_flag else None

        return ExtractionResult(
            incident_type=data.get("incident_type", "general"),
            severity=data.get("severity", "medium"),
            confidence=float(data.get("confidence", 0.85)),
            extracted_fields={k: v for k, v in ef.items() if v is not None and v != "null"},
            missing_fields=data.get("missing_fields", []),
            follow_up_prompts=data.get("follow_up_prompts", []),
            osha_flag=bool(osha_flag),
            osha_reason=osha_reason,
            summary=data.get("summary", "Incident analyzed."),
        )
    except Exception as exc:
        logger.warning("Claude extraction failed (%s), falling back to rule-based", exc)
        return _rule_based_extract(text, None)


# ── Public entry point ────────────────────────────────────────────────────────

def extract_incident(text: str, hint_type: str | None = None) -> ExtractionResult:
    """
    Extract structured incident data from natural language.
    Uses Claude when ANTHROPIC_API_KEY is configured; otherwise rule-based.
    """
    from app.core.config import settings

    if settings.anthropic_api_key:
        return _claude_extract(text, settings.anthropic_api_key)

    return _rule_based_extract(text, hint_type)
