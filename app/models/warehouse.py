import uuid
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


class Warehouse(BaseModel, SoftDeleteMixin):
    """Gudang (induk/pusat) — LOKASI stok selain proyek.

    Stok melekat pada LOKASI: gudang ATAU proyek (lihat StockMovement).
    Material masuk ke gudang dari vendor, lalu di-TRANSFER ke proyek,
    baru DIDISTRIBUSIKAN ke unit (titik ini yang jadi biaya).
    """
    __tablename__ = "warehouses"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<Warehouse {self.name}>"
