import random
import string
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

QR_TARGET_TYPES = ("center", "room", "kennel", "equipment", "inspection_zone", "general")


def _short_code() -> str:
    """Generate a compact, URL-safe code like PG-A3B2C1."""
    chars = random.choices(string.ascii_uppercase + string.digits, k=6)
    return "PG-" + "".join(chars)


class QRCode(Base):
    __tablename__ = "qr_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(
        String, nullable=False, unique=True, index=True,
        default=_short_code,
    )
    target_type: Mapped[str] = mapped_column(String, nullable=False, default="general")
    target_name: Mapped[str] = mapped_column(String, nullable=False)
    center_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Flexible metadata: room number, kennel ID, equipment tag, etc.
    target_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
