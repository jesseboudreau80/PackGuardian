"""
Rule-based evidence intelligence.
Pure functions — no I/O, no DB.  Mirrors the intelligence engine philosophy.
"""
from __future__ import annotations

import io
import logging
import re

logger = logging.getLogger(__name__)

# ── Text extraction ───────────────────────────────────────────────────────────

try:
    from pdfminer.high_level import extract_text as _pdf_extract
    _PDF_SUPPORT = True
except ImportError:
    _PDF_SUPPORT = False
    logger.info("[evidence] pdfminer not installed — PDF text extraction disabled")


def extract_text(content: bytes, mime_type: str) -> str | None:
    """Extract text from file bytes. Returns None if extraction not supported."""
    if mime_type == "application/pdf" and _PDF_SUPPORT:
        try:
            return _pdf_extract(io.BytesIO(content))
        except Exception as exc:
            logger.warning("PDF extraction failed: %s", exc)
            return None
    if mime_type == "text/plain":
        try:
            return content.decode("utf-8", errors="replace")
        except Exception:
            return None
    return None  # images, video, audio — would need OCR/transcription


# ── Risk signals by category ──────────────────────────────────────────────────

_CATEGORY_SIGNALS: dict[str, list[dict]] = {
    "witness_statement": [
        {"signal": "witness_account", "severity": "medium",
         "description": "Witness testimony recorded — preserve chain of custody"},
        {"signal": "potential_liability", "severity": "high",
         "description": "Witness statements may create employer liability exposure"},
    ],
    "injury_photo": [
        {"signal": "visual_evidence", "severity": "high",
         "description": "Photographic evidence of injury — OSHA recordability likely"},
        {"signal": "hazard_documentation", "severity": "high",
         "description": "Visual documentation of workplace hazard present"},
    ],
    "inspection_report": [
        {"signal": "regulatory_inspection", "severity": "medium",
         "description": "Inspection report may trigger corrective action requirements"},
        {"signal": "compliance_gap", "severity": "medium",
         "description": "Review findings against current OSHA standards"},
    ],
    "corrective_action": [
        {"signal": "remediation_documented", "severity": "low",
         "description": "Corrective action in progress — track to completion"},
    ],
    "workers_comp": [
        {"signal": "workers_comp_claim", "severity": "high",
         "description": "Workers compensation claim — coordinate with benefits team"},
        {"signal": "recordable_likely", "severity": "high",
         "description": "Workers comp filing typically indicates OSHA recordable incident"},
    ],
    "osha_form": [
        {"signal": "osha_documentation", "severity": "high",
         "description": "OSHA form submitted — ensure 300 log is updated"},
        {"signal": "regulatory_obligation", "severity": "critical",
         "description": "Regulatory filing obligation — verify deadlines and accuracy"},
    ],
    "hr_document": [
        {"signal": "hr_involvement", "severity": "medium",
         "description": "HR documentation — handle with appropriate confidentiality"},
    ],
    "legal_document": [
        {"signal": "legal_hold", "severity": "critical",
         "description": "Legal document received — implement legal hold protocol"},
        {"signal": "attorney_review", "severity": "critical",
         "description": "Escalate to legal counsel immediately"},
    ],
    "general": [
        {"signal": "evidence_attached", "severity": "low",
         "description": "Supplementary evidence attached to incident record"},
    ],
}

# ── Keyword-based text signals ────────────────────────────────────────────────

_TEXT_SIGNAL_KEYWORDS: list[tuple[frozenset[str], dict]] = [
    (frozenset({"lawsuit", "litigation", "attorney", "legal", "counsel", "sue", "court"}),
     {"signal": "legal_mention", "severity": "critical",
      "description": "Legal terminology detected — attorney notification required"}),
    (frozenset({"osha", "violation", "citation", "penalty", "fine", "inspection"}),
     {"signal": "osha_reference", "severity": "high",
      "description": "OSHA regulatory reference detected — compliance review required"}),
    (frozenset({"fracture", "broken", "surgery", "hospital", "emergency", "ambulance", "stitches"}),
     {"signal": "serious_injury", "severity": "critical",
      "description": "Serious injury indicators found in document text"}),
    (frozenset({"harassment", "discrimination", "hostile", "retaliation"}),
     {"signal": "hr_violation", "severity": "high",
      "description": "Potential workplace conduct violation detected"}),
    (frozenset({"witness", "saw", "observed", "testimony", "statement"}),
     {"signal": "witness_content", "severity": "medium",
      "description": "Witness account language found in document"}),
    (frozenset({"corrective", "remediation", "fix", "repair", "address", "resolve"}),
     {"signal": "remediation_plan", "severity": "low",
      "description": "Corrective action language found — track implementation"}),
]


def _tokenize(text: str) -> frozenset[str]:
    return frozenset(re.findall(r"[a-z]+", text.lower()))


def analyze(
    file_name: str,
    category: str,
    mime_type: str,
    extracted_text: str | None,
) -> dict:
    """
    Run evidence intelligence analysis.
    Returns: {ai_summary, ai_tags, ai_risk_signals}
    """
    risk_signals: list[dict] = list(_CATEGORY_SIGNALS.get(category, _CATEGORY_SIGNALS["general"]))
    tags: list[str] = [category.replace("_", " ").title()]

    # MIME-type tags
    if mime_type.startswith("image/"):
        tags.append("Photo")
    elif mime_type == "application/pdf":
        tags.append("PDF")
    elif mime_type.startswith("video/"):
        tags.append("Video")
    elif mime_type.startswith("audio/"):
        tags.append("Audio")
    else:
        tags.append("Document")

    # Text analysis
    if extracted_text and len(extracted_text.strip()) > 20:
        tokens = _tokenize(extracted_text)
        tags.append("Text Extracted")
        for keywords, signal in _TEXT_SIGNAL_KEYWORDS:
            if keywords & tokens:
                if not any(s["signal"] == signal["signal"] for s in risk_signals):
                    risk_signals.append(signal)

        # Word count tag
        word_count = len(extracted_text.split())
        tags.append(f"{word_count} words")

    # Build summary
    summary = _build_summary(file_name, category, mime_type, extracted_text, risk_signals)

    return {
        "ai_summary": summary,
        "ai_tags": tags,
        "ai_risk_signals": sorted(
            risk_signals,
            key=lambda s: {"critical": 0, "high": 1, "medium": 2, "low": 3}.get(s["severity"], 4),
        ),
    }


def _build_summary(
    file_name: str,
    category: str,
    mime_type: str,
    text: str | None,
    signals: list[dict],
) -> str:
    category_label = category.replace("_", " ").title()
    file_type = "PDF" if mime_type == "application/pdf" else \
                "image" if mime_type.startswith("image/") else \
                "video" if mime_type.startswith("video/") else \
                "audio recording" if mime_type.startswith("audio/") else "document"

    parts = [f"{file_type.capitalize()} classified as {category_label}."]

    if text:
        preview = text.strip()[:200].replace("\n", " ")
        parts.append(f'Content preview: "{preview}…"' if len(text) > 200 else f'Content: "{preview}"')

    critical = [s for s in signals if s["severity"] in ("critical", "high")]
    if critical:
        parts.append(f"⚠ {len(critical)} high-priority signal(s) detected: "
                     + "; ".join(s["description"] for s in critical[:2]))

    return " ".join(parts)
