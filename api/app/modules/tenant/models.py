import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Stable UUID for the default single-tenant row — safe to reference in seeds and tests.
DEFAULT_TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    logo_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    primary_color: Mapped[str] = mapped_column(String, nullable=False, default="#4F46E5")
    secondary_color: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # "light" | "dark"
    theme: Mapped[str] = mapped_column(String, nullable=False, default="light")
    support_email: Mapped[str] = mapped_column(String, nullable=False)
    support_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
