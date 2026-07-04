import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Integer, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


class KprStage(str, enum.Enum):
    COLLECT_BERKAS = "collect_berkas"        # 1. Collect Berkas
    BERKAS_MASUK_BANK = "berkas_masuk_bank"  # 2. Berkas Masuk Bank
    SP3K = "sp3k"                            # 3. SP3K
    AKAD_KREDIT = "akad_kredit"              # 4. Akad Kredit
    PENCAIRAN = "pencairan"                  # 5. Pencairan


class Bank(BaseModel, SoftDeleteMixin):
    """Master data bank KPR (BTN, BCA, Mandiri, dll)."""
    __tablename__ = "banks"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<Bank {self.name}>"


class KprApplication(BaseModel, SoftDeleteMixin):
    """Pengajuan KPR per pembeli (alur 5 tahap)."""
    __tablename__ = "kpr_applications"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    bank_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("banks.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    stage: Mapped[KprStage] = mapped_column(
        SAEnum(KprStage), default=KprStage.COLLECT_BERKAS, nullable=False
    )
    plafond: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)     # plafon disetujui
    tenor_months: Mapped[int] = mapped_column(Integer, nullable=True)
    interest_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=True)  # % bunga
    sp3k_number: Mapped[str] = mapped_column(String(100), nullable=True)
    sikasep_number: Mapped[str] = mapped_column(String(100), nullable=True)   # subsidi (SiKasep/SiKumbang)
    submitted_date: Mapped[Date] = mapped_column(Date, nullable=True)   # Tgl Collect Berkas — auto dari Client.created_at saat pengajuan dibuat
    bank_submission_date: Mapped[Date] = mapped_column(Date, nullable=True)  # Tgl berkas diserahkan/diajukan ke bank (tahap Berkas Masuk Bank)
    sp3k_date: Mapped[Date] = mapped_column(Date, nullable=True)
    akad_date: Mapped[Date] = mapped_column(Date, nullable=True)
    pencairan_date: Mapped[Date] = mapped_column(Date, nullable=True)
    pencairan_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)
    # tautan ke pembayaran (uang masuk sumber bank) yang otomatis dibuat saat pencairan
    pencairan_payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payments.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    # Penolakan KPR — status terminal (bisa terjadi di tahap mana pun). Datanya DIPERTAHANKAN utk analitik.
    rejected_date: Mapped[Date] = mapped_column(Date, nullable=True)
    rejection_reason: Mapped[str] = mapped_column(Text, nullable=True)

    bank: Mapped["Bank"] = relationship("Bank")

    @property
    def bank_name(self):
        return self.bank.name if self.bank else None

    @property
    def is_rejected(self) -> bool:
        return self.rejected_date is not None

    def __repr__(self) -> str:
        return f"<KprApplication [{self.stage}]>"
