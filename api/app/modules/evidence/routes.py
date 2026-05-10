import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.cases.models import IncidentCase, IncidentTask, CaseTimeline
from app.modules.cases.service import _timeline
from app.modules.organizations.access import get_org_scope, OrgScope
from app.modules.organizations.audit import log as audit_log
from app.modules.organizations.models import OrganizationMember
from app.modules.ws import events as ws

from .analysis import analyze, extract_text
from .models import (
    ALLOWED_MIME_TYPES,
    EVIDENCE_CATEGORIES,
    EVIDENCE_VISIBILITIES,
    MAX_FILE_BYTES,
    EvidenceFile,
    EvidenceNote,
)
from .schemas import EvidenceFileRead, EvidenceNoteRead, OperationalEvent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/evidence", tags=["Evidence"])

# ── Visibility helpers ────────────────────────────────────────────────────────

_MGMT_ROLES = frozenset({"admin", "center_manager", "district_manager", "area_manager"})


def _user_org_roles(db: Session, user_id: uuid.UUID) -> set[str]:
    rows = db.query(OrganizationMember.role).filter(
        OrganizationMember.user_id == user_id
    ).all()
    return {r.role for r in rows}


def _can_see(ef: EvidenceFile, user: User, roles: set[str]) -> bool:
    if user.role == "admin":
        return True
    if ef.visibility == "all":
        return True
    if ef.visibility == "hr_only":
        return "hr" in roles
    if ef.visibility == "legal_only":
        return "legal" in roles
    if ef.visibility == "management_only":
        return bool(roles & _MGMT_ROLES)
    return False


# ── Storage helpers ───────────────────────────────────────────────────────────

def _storage_root() -> Path:
    root = Path(getattr(settings, "upload_dir", "/tmp/packguardian_uploads"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def _file_path(tenant_id: uuid.UUID, case_id: uuid.UUID, file_id: uuid.UUID, file_name: str) -> Path:
    ext = Path(file_name).suffix
    dir_ = _storage_root() / str(tenant_id) / str(case_id)
    dir_.mkdir(parents=True, exist_ok=True)
    return dir_ / f"{file_id}{ext}"


def _get_case_or_404(db: Session, case_id: uuid.UUID, tenant_id: uuid.UUID) -> IncidentCase:
    case = db.query(IncidentCase).filter(
        IncidentCase.id == case_id,
        IncidentCase.tenant_id == tenant_id,
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


def _scope_check(case: IncidentCase, scope: OrgScope) -> None:
    if (scope.accessible_org_ids is not None
            and case.organization_id not in scope.accessible_org_ids):
        raise HTTPException(status_code=404, detail="Case not found")


def _enrich(ef: EvidenceFile, db: Session) -> EvidenceFileRead:
    note = db.query(EvidenceNote).filter(
        EvidenceNote.evidence_file_id == ef.id
    ).first()
    result = EvidenceFileRead.model_validate(ef)
    if note:
        result.note = EvidenceNoteRead.model_validate(note)
    return result


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/cases/{case_id}/upload",
             response_model=EvidenceFileRead,
             status_code=status.HTTP_201_CREATED)
async def upload_evidence(
    case_id: uuid.UUID,
    file: UploadFile,
    category: Annotated[str, Form()] = "general",
    visibility: Annotated[str, Form()] = "all",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> EvidenceFileRead:
    case = _get_case_or_404(db, case_id, current_user.tenant_id)
    _scope_check(case, scope)

    if category not in EVIDENCE_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Invalid category: {category}")
    if visibility not in EVIDENCE_VISIBILITIES:
        raise HTTPException(status_code=422, detail=f"Invalid visibility: {visibility}")

    # Validate MIME
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"File type '{content_type}' is not supported"
        )

    # Read content with size guard
    content = await file.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {MAX_FILE_BYTES // (1024*1024)} MB limit"
        )

    file_id = uuid.uuid4()
    safe_name = Path(file.filename or "upload").name
    dest = _file_path(current_user.tenant_id, case_id, file_id, safe_name)
    dest.write_bytes(content)

    ef = EvidenceFile(
        id=file_id,
        tenant_id=current_user.tenant_id,
        case_id=case_id,
        incident_id=case.incident_id,
        uploaded_by_user_id=current_user.id,
        file_name=safe_name,
        file_type=content_type,
        storage_path=str(dest),
        file_size=len(content),
        category=category,
        visibility=visibility,
        ai_processed=False,
    )
    db.add(ef)
    db.flush()

    # Timeline entry
    _timeline(db, case_id, current_user.tenant_id, current_user.id,
              "evidence_uploaded",
              {"file_id": str(file_id), "file_name": safe_name,
               "category": category, "visibility": visibility})

    audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
              action="incident_modified", resource_type="evidence",
              resource_id=file_id,
              details={"op": "upload", "file_name": safe_name, "category": category})

    # AI analysis (synchronous — fast for most files)
    note: EvidenceNote | None = None
    try:
        extracted = extract_text(content, content_type)
        intel = analyze(safe_name, category, content_type, extracted)
        note = EvidenceNote(
            evidence_file_id=file_id,
            extracted_text=extracted[:50_000] if extracted else None,
            ai_summary=intel["ai_summary"],
            ai_tags=intel["ai_tags"],
            ai_risk_signals=intel["ai_risk_signals"],
        )
        db.add(note)
        ef.ai_processed = True
    except Exception as exc:
        logger.warning("[evidence] AI analysis failed for %s: %s", file_id, exc)

    db.commit()
    db.refresh(ef)

    # WS broadcasts
    ws.evidence_uploaded(current_user.tenant_id,
                         file_id=file_id, case_id=case_id,
                         file_name=safe_name, category=category,
                         visibility=visibility)
    if ef.ai_processed:
        ws.evidence_analyzed(current_user.tenant_id,
                             file_id=file_id, case_id=case_id)

    logger.info("[packguardian][evidence] Uploaded: file=%s case=%s tenant=%s",
                file_id, case_id, current_user.tenant_id)
    return _enrich(ef, db)


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/cases/{case_id}/files", response_model=list[EvidenceFileRead])
def list_evidence(
    case_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    scope: OrgScope = Depends(get_org_scope),
) -> list[EvidenceFileRead]:
    case = _get_case_or_404(db, case_id, current_user.tenant_id)
    _scope_check(case, scope)
    roles = _user_org_roles(db, current_user.id)
    files = (
        db.query(EvidenceFile)
        .filter(EvidenceFile.case_id == case_id,
                EvidenceFile.tenant_id == current_user.tenant_id)
        .order_by(EvidenceFile.uploaded_at.desc())
        .all()
    )
    return [_enrich(ef, db) for ef in files if _can_see(ef, current_user, roles)]


# ── Single file metadata ──────────────────────────────────────────────────────

@router.get("/files/{file_id}", response_model=EvidenceFileRead)
def get_evidence_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EvidenceFileRead:
    ef = db.query(EvidenceFile).filter(
        EvidenceFile.id == file_id,
        EvidenceFile.tenant_id == current_user.tenant_id,
    ).first()
    if not ef:
        raise HTTPException(status_code=404, detail="File not found")
    roles = _user_org_roles(db, current_user.id)
    if not _can_see(ef, current_user, roles):
        raise HTTPException(status_code=403, detail="Access denied")
    return _enrich(ef, db)


# ── Download / serve ──────────────────────────────────────────────────────────

@router.get("/files/{file_id}/download")
def download_evidence(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    ef = db.query(EvidenceFile).filter(
        EvidenceFile.id == file_id,
        EvidenceFile.tenant_id == current_user.tenant_id,
    ).first()
    if not ef:
        raise HTTPException(status_code=404, detail="File not found")
    roles = _user_org_roles(db, current_user.id)
    if not _can_see(ef, current_user, roles):
        raise HTTPException(status_code=403, detail="Access denied")
    if not Path(ef.storage_path).exists():
        raise HTTPException(status_code=404, detail="File data not found on server")
    return FileResponse(
        ef.storage_path,
        media_type=ef.file_type,
        filename=ef.file_name,
    )


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_evidence(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    ef = db.query(EvidenceFile).filter(
        EvidenceFile.id == file_id,
        EvidenceFile.tenant_id == current_user.tenant_id,
    ).first()
    if not ef:
        raise HTTPException(status_code=404, detail="File not found")
    # Only uploader or admin can delete
    if ef.uploaded_by_user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the uploader or admin can delete evidence")

    # Remove from disk (non-fatal)
    try:
        Path(ef.storage_path).unlink(missing_ok=True)
    except Exception:
        pass

    # Remove note if present
    db.query(EvidenceNote).filter(EvidenceNote.evidence_file_id == file_id).delete()
    audit_log(db, tenant_id=current_user.tenant_id, actor_id=current_user.id,
              action="incident_modified", resource_type="evidence",
              resource_id=file_id,
              details={"op": "delete", "file_name": ef.file_name})
    db.delete(ef)
    db.commit()
    logger.info("[packguardian][evidence] Deleted: file=%s by user=%s", file_id, current_user.id)
