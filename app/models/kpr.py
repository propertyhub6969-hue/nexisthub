import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Integer, Date, DateTime
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
    # PIC bank + tanda tangan — bukti serah berkas ke bank, diisi/dikunci di tahap Berkas Masuk Bank saja
    pic_bank_name: Mapped[str] = mapped_column(String(200), nullable=True)
    pic_bank_signature: Mapped[str] = mapped_column(Text, nullable=True)  # data URL base64, spt Client.signature
    # File SP3K (resmi, hasil terima kiriman bank — lihat KprBankSubmission)
    sp3k_file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    sp3k_file_type: Mapped[str] = mapped_column(String(100), nullable=True)
    sp3k_file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    sp3k_file_key: Mapped[str] = mapped_column(String(600), nullable=True)

    bank: Mapped["Bank"] = relationship("Bank")

    @property
    def bank_name(self):
        return self.bank.name if self.bank else None

    @property
    def is_rejected(self) -> bool:
        return self.rejected_date is not None

    @property
    def has_sp3k_file(self) -> bool:
        return self.sp3k_file_name is not None

    def __repr__(self) -> str:
        return f"<KprApplication [{self.stage}]>"


class BankShareLink(BaseModel):
    """Tautan bertoken (tanpa login) utk 1 bank — bank lihat status pemberkasan pembeli yg
    ditanganinya & kirim update (menunggu persetujuan developer). Pola sama MonthlyTaxShareLink."""
    __tablename__ = "bank_share_links"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    bank_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("banks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bank_name_snapshot: Mapped[str] = mapped_column(String(200), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    last_accessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    access_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None and self.expires_at > datetime.now(timezone.utc)


class BankSubmissionStatus(str, enum.Enum):
    PENDING = "pending"    # menunggu diterima/ditolak developer
    ACCEPTED = "accepted"  # sudah diterapkan ke KprApplication
    REJECTED = "rejected"  # ditolak, tak menyentuh data KPR


class KprBankSubmission(BaseModel):
    """Kiriman dari bank lewat tautan (belum resmi) — developer terima/tolak sebelum data KPR berubah."""
    __tablename__ = "kpr_bank_submissions"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kpr_application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("kpr_applications.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bank_share_link_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bank_share_links.id", ondelete="SET NULL"), nullable=True
    )
    submitted_stage: Mapped[KprStage] = mapped_column(SAEnum(KprStage), nullable=False)
    submitted_sp3k_number: Mapped[str] = mapped_column(String(100), nullable=True)
    submitted_sp3k_date: Mapped[Date] = mapped_column(Date, nullable=True)
    # plafon & tenor bisa berubah dari sisi bank (mis. hasil appraisal/keputusan kredit) — dikirim spt field lain
    submitted_plafond: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)
    submitted_tenor_months: Mapped[int] = mapped_column(Integer, nullable=True)
    # catatan dari BANK saat kirim (mis. kurang berkas, ditolak, alasan lain) — bank tak punya tombol
    # "tolak" sendiri; developer yang putuskan terima/tolak lewat halaman Kiriman Bank, catatan ini konteksnya.
    submitted_notes: Mapped[str] = mapped_column(Text, nullable=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    file_type: Mapped[str] = mapped_column(String(100), nullable=True)
    file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    file_key: Mapped[str] = mapped_column(String(600), nullable=True)
    status: Mapped[BankSubmissionStatus] = mapped_column(
        SAEnum(BankSubmissionStatus), default=BankSubmissionStatus.PENDING, nullable=False
    )
    reviewed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)  # mis. alasan tolak

    @property
    def has_file(self) -> bool:
        return self.file_name is not None
