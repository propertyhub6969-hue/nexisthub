import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Date
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


class MovementType(str, enum.Enum):
    IN = "in"     # Barang masuk (beli / terima dari PO)
    OUT = "out"   # Keluar / distribusi ke unit


class MovementSource(str, enum.Enum):
    PO = "po"                 # Terima dari Purchase Order
    DIRECT = "direct"         # Beli langsung
    DISTRIBUTION = "distribution"  # Distribusi ke unit
    ADJUSTMENT = "adjustment"      # Penyesuaian/koreksi


class StockMovement(BaseModel, SoftDeleteMixin):
    """Kartu stok material per proyek: barang masuk & distribusi ke unit."""
    __tablename__ = "stock_movements"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    material_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    unit: Mapped[str] = mapped_column(String(50), nullable=True)   # sak, m3, batang
    movement_type: Mapped[MovementType] = mapped_column(SAEnum(MovementType), nullable=False)
    source: Mapped[MovementSource] = mapped_column(
        SAEnum(MovementSource), default=MovementSource.DIRECT, nullable=False
    )
    quantity: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)  # harga/satuan (IN: beli; OUT: HPP rata2)
    # untuk OUT: unit tujuan distribusi (kosong = pekerjaan umum proyek)
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="SET NULL"), nullable=True, index=True
    )
    po_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True
    )
    po_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_order_items.id", ondelete="SET NULL"), nullable=True, index=True
    )  # item PO yang diterima (untuk hitung sisa penerimaan per item)
    do_number: Mapped[str] = mapped_column(String(50), nullable=True)  # no. surat jalan / DO dari vendor
    movement_date: Mapped[Date] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<StockMovement {self.movement_type} {self.material_name} {self.quantity}>"
