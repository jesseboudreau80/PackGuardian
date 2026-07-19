from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User

from .extraction import ExtractionResult, extract_incident

router = APIRouter(prefix="/ai", tags=["AI Intelligence"])


class ExtractRequest(BaseModel):
    text: str
    hint_type: str | None = None  # caller's initial type selection, if any


class ExtractResponse(BaseModel):
    incident_type: str
    severity: str
    confidence: float
    extracted_fields: dict
    missing_fields: list[str]
    follow_up_prompts: list[str]
    osha_flag: bool
    osha_reason: str | None
    summary: str
    engine: str  # "claude" | "rule_based" — for transparency in the UI


@router.post("/extract", response_model=ExtractResponse)
def extract(
    req: ExtractRequest,
    current_user: User = Depends(get_current_user),
) -> ExtractResponse:
    """
    Extract structured incident data from natural language (voice or typed).

    Uses Claude when ANTHROPIC_API_KEY is configured.
    Falls back to the enhanced rule-based engine otherwise.
    Both return the same schema.
    """
    from app.core.config import settings

    result: ExtractionResult = extract_incident(req.text, req.hint_type)
    engine = "claude" if settings.anthropic_api_key else "rule_based"

    return ExtractResponse(
        incident_type=result.incident_type,
        severity=result.severity,
        confidence=result.confidence,
        extracted_fields=result.extracted_fields,
        missing_fields=result.missing_fields,
        follow_up_prompts=result.follow_up_prompts,
        osha_flag=result.osha_flag,
        osha_reason=result.osha_reason,
        summary=result.summary,
        engine=engine,
    )
