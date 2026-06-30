from sqlalchemy import Column, Integer, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
import uuid
from sqlalchemy.dialects.postgresql import UUID


class TimestampMixin:
    """Mixin for created_at and updated_at timestamps."""
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        onupdate=func.now(), nullable=False
    )


class SoftDeleteMixin:
    """Mixin for soft delete (is_deleted flag)."""
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class BaseModel(Base, TimestampMixin):
    """Abstract base model with UUID primary key and timestamps."""
    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
