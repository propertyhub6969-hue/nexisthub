import uuid
import enum
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, Numeric, Integer, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import BaseModel


class VendorStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    BLACKLISTED = "blacklisted"


class POStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    ORDERED = "ordered"
    RECEIVED = "received"
    CANCELLED = "cancelled"


class Vendor(BaseModel):
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
    category: Mapped[str] = mapped_column(String(100), nullable=True)  # Material, Jasa, dll
    npwp: Mapped[str] = mapped_column(String(30), nullable=True)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=True)
    bank_account: Mapped[str] = mapped_column(String(50), nullable=True)
    status: Mapped[VendorStatus] = mapped_column(
        SAEnum(VendorStatus), default=VendorStatus.ACTIVE, nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(
        "PurchaseOrder", back_populates="vendor"
    )

    def __repr__(self) -> str:
        return f"<Vendor {self.name}>"


class PurchaseOrder(BaseModel):
    """Purchase Order ke vendor."""
    __tablename__ = "purchase_orders"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    vendor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT"),
        nullable=False
    )
    po_number: Mapped[str] = mapped_column(String(50), nullable=False)
    order_date: Mapped[Date] = mapped_column(Date, nullable=True)
    delivery_date: Mapped[Date] = mapped_column(Date, nullable=True)
    total_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0, nullable=False)
    status: Mapped[POStatus] = mapped_column(
        SAEnum(POStatus), default=POStatus.DRAFT, nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    approved_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="purchase_orders")
    items: Mapped[list["PurchaseOrderItem"]] = relationship(
        "PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan"
    )

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
        nullable=False
    )
    item_name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(String(50), nullable=True)       # pcs, m2, kg, dll
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    total_price: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    purchase_order: Mapped["PurchaseOrder"] = relationship(
        "PurchaseOrder", back_populates="items"
    )

    def __repr__(self) -> str:
        return f"<POItem {self.item_name} qty={self.quantity}>"
