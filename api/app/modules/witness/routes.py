import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.cases.models import IncidentCase
from app.modules.cases.service import _timeline
from app.modules.organizations.audit import log as audit_log

from .models import WitnessStatement
from .schemas import WitnessAISummary, WitnessStatementCreate, WitnessStatementRead

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cases/{case_id}/witnesses", tags=["Witness Statements"])


def _get_case_or_404(db: Session, case_id: uuid.UUID, tenant_id: uuid.UUID) -> IncidentCase:
    case = db.query(IncidentCase).filter(
        IncidentCase.id == case_id,
        IncidentCase.tenant_id == tenant_id,
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


def _ai_summarize(statements: list[WitnessStatement]) -> WitnessAISummary:
    """
    Synthesize multiple witness statements.
    Uses Claude if ANTHROPIC_API_KEY is set, otherwise rule-based.
    """
    if not statements:
        return WitnessAISummary(
            statement_count=0,
            common_sequence="No statements recorded.",
            discrepancies=[],
            likely_triggers=[],
            missing_information=["No witness statements have been collected yet."],
            engine="none",
        )

    from app.core.config import settings

    combined = "\n\n---\n\n".join(
        f"Witness: {s.witness_name} ({s.witness_role or 'Unknown role'})\n"
        f"Observed directly: {'Yes' if s.observed_directly else 'No'}\n"
        f"Intervention attempted: {'Yes' if s.intervention_attempted else 'No'}\n"
        f"Statement: {s.statement}"
        for s in statements
    )

    if settings.anthropic_api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                system=(
                    "You are an incident investigation assistant for a pet care safety platform. "
                    "Analyze multiple witness statements and produce a structured synthesis. "
                    "DO NOT assign blame. Focus on what happened, not who is at fault. "
                    "Respond ONLY with valid JSON matching this schema:\n"
                    '{"common_sequence":"<1-3 sentence timeline of events everyone agrees on>",'
                    '"discrepancies":["<discrepancy 1>","<discrepancy 2>"],'
                    '"likely_triggers":["<trigger 1>"],'
                    '"missing_information":["<gap 1>"]}'
                ),
                messages=[{"role": "user", "content": f"Synthesize these statements:\n\n{combined[:6000]}"}],
            )
            import json, re
            raw = msg.content[0].text.strip()
            if raw.startswith("```"):
                raw = re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()
            data = json.loads(raw)
            return WitnessAISummary(
                statement_count=len(statements),
                common_sequence=data.get("common_sequence", ""),
                discrepancies=data.get("discrepancies", []),
                likely_triggers=data.get("likely_triggers", []),
                missing_information=data.get("missing_information", []),
                engine="claude",
            )
        except Exception as exc:
            logger.warning("[witness] Claude synthesis failed: %s", exc)

    # Rule-based fallback
    observers = sum(1 for s in statements if s.observed_directly)
    interveners = sum(1 for s in statements if s.intervention_attempted)
    return WitnessAISummary(
        statement_count=len(statements),
        common_sequence=(
            f"{len(statements)} statement(s) collected. "
            f"{observers} witness(es) directly observed the incident. "
            f"{interveners} attempted intervention."
        ),
        discrepancies=[
            "Manual review recommended — AI synthesis requires ANTHROPIC_API_KEY."
        ] if not settings.anthropic_api_key else [],
        likely_triggers=[],
        missing_information=[
            f for f in ["witness_role", "shift_at_time"]
            if any(not getattr(s, f) for s in statements)
        ],
        engine="rule_based",
    )


@router.get("", response_model=list[WitnessStatementRead])
def list_witnesses(
    case_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[WitnessStatementRead]:
    _get_case_or_404(db, case_id, current_user.tenant_id)
    rows = db.query(WitnessStatement).filter(
        WitnessStatement.case_id == case_id,
        WitnessStatement.tenant_id == current_user.tenant_id,
    ).order_by(WitnessStatement.created_at.asc()).all()
    return [WitnessStatementRead.model_validate(r) for r in rows]


@router.post("", response_model=WitnessStatementRead, status_code=status.HTTP_201_CREATED)
def add_witness(
    case_id: uuid.UUID,
    payload: WitnessStatementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WitnessStatementRead:
    case = _get_case_or_404(db, case_id, current_user.tenant_id)
    ws = WitnessStatement(
        tenant_id=current_user.tenant_id,
        case_id=case_id,
        incident_id=case.incident_id,
        witness_name=payload.witness_name,
        witness_role=payload.witness_role,
        shift_at_time=payload.shift_at_time,
        observed_directly=payload.observed_directly,
        intervention_attempted=payload.intervention_attempted,
        statement=payload.statement,
        statement_timestamp=payload.statement_timestamp,
        recorded_by_user_id=current_user.id,
    )
    db.add(ws)
    db.flush()
    _timeline(db, case_id, current_user.tenant_id, current_user.id,
              "witness_statement_added",
              {"ws_id": str(ws.id), "witness_name": payload.witness_name,
               "observed_directly": payload.observed_directly})
    audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
              action="incident_modified", resource_type="witness_statement",
              resource_id=ws.id, details={"op": "add", "witness": payload.witness_name})
    try:
        from app.modules.signals.risk_scoring import apply_risk_score
        apply_risk_score(db, case.incident_id, current_user.tenant_id)
    except Exception:
        pass
    db.commit()
    db.refresh(ws)
    return WitnessStatementRead.model_validate(ws)


@router.delete("/{ws_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_witness(
    case_id: uuid.UUID,
    ws_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    _get_case_or_404(db, case_id, current_user.tenant_id)
    ws = db.query(WitnessStatement).filter(
        WitnessStatement.id == ws_id,
        WitnessStatement.case_id == case_id,
        WitnessStatement.tenant_id == current_user.tenant_id,
    ).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Witness statement not found")
    if ws.recorded_by_user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the recorder or admin can delete")
    db.delete(ws)
    db.commit()


@router.get("/synthesize", response_model=WitnessAISummary)
def synthesize_witnesses(
    case_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WitnessAISummary:
    _get_case_or_404(db, case_id, current_user.tenant_id)
    statements = db.query(WitnessStatement).filter(
        WitnessStatement.case_id == case_id,
        WitnessStatement.tenant_id == current_user.tenant_id,
    ).order_by(WitnessStatement.created_at).all()
    return _ai_summarize(statements)
