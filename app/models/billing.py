import uuid
import enum
from datetime import date
from sqlalchemy import String, ForeignKey, Numeric, Date, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class InvoiceStatus(str, enum.Enum):
    UNPAID = "unpaid"
    PAID = "paid"
    VOID = "void"


class Invoice(BaseModel):
    """Tagihan langganan tenant (billing manual). Mark-paid memperpanjang masa aktif tenant."""
    __tablename__ = "invoices"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)   # jadi expires_at baru saat lunas
    plan: Mapped[str] = mapped_column(String(50), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    status: Mapped[InvoiceStatus] = mapped_column(SAEnum(InvoiceStatus), default=InvoiceStatus.UNPAID, nullable=False)
    method: Mapped[str] = mapped_column(String(50), nullable=True)   # transfer, tunai, dll
    paid_at: Mapped[date] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<Invoice {self.amount} [{self.status}]>"
