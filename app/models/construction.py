import uuid
import enum
from sqlalchemy import Text, ForeignKey, Enum as SAEnum, Integer, Date
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class ConstructionStage(str, enum.Enum):
    PERSIAPAN = "persiapan"
    PONDASI = "pondasi"
    STRUKTUR = "struktur"
    DINDING = "dinding"
    ATAP = "atap"
    FINISHING = "finishing"
    SELESAI = "selesai"


class UnitConstruction(BaseModel):
    """Progres pembangunan sebuah unit (1 baris per unit)."""
    __tablename__ = "unit_constructions"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False, index=True, unique=True
    )
    stage: Mapped[ConstructionStage] = mapped_column(
        SAEnum(ConstructionStage), default=ConstructionStage.PERSIAPAN, nullable=False
    )
    percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 0-100
    start_date: Mapped[Date] = mapped_column(Date, nullable=True)
    target_date: Mapped[Date] = mapped_column(Date, nullable=True)
    finish_date: Mapped[Date] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<UnitConstruction {self.stage} {self.percent}%>"
