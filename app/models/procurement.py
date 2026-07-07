import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel, SoftDeleteMixin


class VendorStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    BLACKLISTED = "blacklisted"


class POStatus(str, enum.Enum):
    DRAFT = "draft"
    ORDERED = "ordered"       # dipesan
    RECEIVED = "received"     # diterima di lokasi
    CANCELLED = "cancelled"


class PaymentMethod(str, enum.Enum):
    TRANSFER = "transfer"
    TUNAI = "tunai"
    LAINNYA = "lainnya"


class Vendor(BaseModel, SoftDeleteMixin):
    """Supplier / kontraktor / vendor material."""
    __tablename__ = "vendors"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(200), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=True)  # Material, Jasa/Kontraktor, dll
    npwp: Mapped[str] = mapped_column(String(30), nullable=True)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=True)
    bank_account: Mapped[str] = mapped_column(String(50), nullable=True)
    status: Mapped[VendorStatus] = mapped_column(
        SAEnum(VendorStatus), default=VendorStatus.ACTIVE, nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<Vendor {self.name}>"


class PurchaseOrder(BaseModel, SoftDeleteMixin):
    """Purchase Order ke vendor (alokasi ke proyek, opsional unit)."""
    __tablename__ = "purchase_orders"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    vendor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("units.id", ondelete="SET NULL"), nullable=True, index=True
    )
    po_number: Mapped[str] = mapped_column(String(50), nullable=True)
    order_date: Mapped[Date] = mapped_column(Date, nullable=True)
    delivery_date: Mapped[Date] = mapped_column(Date, nullable=True)
    total_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    status: Mapped[POStatus] = mapped_column(
        SAEnum(POStatus), default=POStatus.DRAFT, nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    vendor: Mapped["Vendor"] = relationship("Vendor")
    items: Mapped[list["PurchaseOrderItem"]] = relationship(
        "PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan"
    )
    payments: Mapped[list["VendorPayment"]] = relationship(
        "VendorPayment", back_populates="purchase_order", cascade="all, delete-orphan"
    )

    @property
    def vendor_name(self):
        return self.vendor.name if self.vendor else None

    def __repr__(self) -> str:
        return f"<PO {self.po_number} [{self.status}]>"


class PurchaseOrderItem(BaseModel):
    """Line item dalam PO."""
    __tablename__ = "purchase_order_items"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    purchase_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(String(50), nullable=True)       # sak, m3, kg, batang, dll
    quantity: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    total_price: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    purchase_order: Mapped["PurchaseOrder"] = relationship("PurchaseOrder", back_populates="items")

    def __repr__(self) -> str:
        return f"<POItem {self.item_name} qty={self.quantity}>"


class VendorPayment(BaseModel, SoftDeleteMixin):
    """Pembayaran ke vendor atas sebuah PO (uang keluar)."""
    __tablename__ = "vendor_payments"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    purchase_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    payment_date: Mapped[Date] = mapped_column(Date, nullable=True)
    method: Mapped[PaymentMethod] = mapped_column(
        SAEnum(PaymentMethod, name="vendorpaymentmethod"), default=PaymentMethod.TRANSFER, nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    purchase_order: Mapped["PurchaseOrder"] = relationship("PurchaseOrder", back_populates="payments")

    def __repr__(self) -> str:
        return f"<VendorPayment {self.amount}>"


class Material(BaseModel, SoftDeleteMixin):
    """Master material — untuk konsistensi nama + autofill satuan & harga di PO/stok."""
    __tablename__ = "materials"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(String(50), nullable=True)          # satuan default: sak, m3, kg, batang
    category: Mapped[str] = mapped_column(String(100), nullable=True)     # semen, besi, pasir, dll
    last_price: Mapped[float] = mapped_column(Numeric(15, 2), nullable=True)  # harga terakhir/standar
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<Material {self.name}>"
