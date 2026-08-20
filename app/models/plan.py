from sqlalchemy import String, Text, Numeric, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB
from app.models.base import BaseModel


class Plan(BaseModel):
    """Katalog paket langganan NexistHub (level platform/vendor, bukan per-tenant).
    Dikelola super-admin di Control Plane → Paket & Harga."""
    __tablename__ = "plans"

    name: Mapped[str] = mapped_column(String(80), nullable=False)
    price: Mapped[float] = mapped_column(Numeric(14, 2), nullable=True)   # None/0 = harga khusus/hubungi kami
    price_note: Mapped[str] = mapped_column(String(60), nullable=True, default="/bulan")
    description: Mapped[str] = mapped_column(Text, nullable=True)
    features: Mapped[list] = mapped_column(JSONB, nullable=True)          # daftar poin fitur (list[str])
    highlight: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # tandai "paling populer"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<Plan {self.name} {self.price}>"
