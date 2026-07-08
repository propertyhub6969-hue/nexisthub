"""Migrasi file lama (blob LargeBinary di Postgres) → MinIO.

Untuk tiap kolom file: baca blob yang masih di DB (file_key kosong), unggah ke MinIO,
set file_key, kosongkan blob. Idempotent (baris yg sudah punya file_key dilewati).
Jalankan di dalam container backend:
    docker exec -e PYTHONPATH=/app -w /app nexisthub_backend python scripts/migrate_files_to_minio.py
"""
import asyncio

from sqlalchemy import select, update

from app.core.database import AsyncSessionLocal
from app.core import storage
# Import SEMUA model agar mapper SQLAlchemy lengkap (relasi antar-model teregistrasi)
from app.models.tenant import Tenant  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.marketing import Lead, Prospect, Client  # noqa: F401
from app.models.property import Project, Unit  # noqa: F401
from app.models.sale import Sale  # noqa: F401
from app.models.payment import PaymentSchedule, Payment  # noqa: F401
from app.models.tax import Notary, TaxRecord, NotaryFee  # noqa: F401
from app.models.document import Document  # noqa: F401
from app.models.kpr import Bank, KprApplication  # noqa: F401
from app.models.procurement import Vendor, PurchaseOrder, PurchaseOrderItem, VendorPayment  # noqa: F401
from app.models.stock import StockMovement  # noqa: F401
from app.models.expense import Expense  # noqa: F401
from app.models.rab import RabTemplate, RabTemplateLine, UnitRabAdjustment  # noqa: F401
from app.models.construction import UnitConstruction  # noqa: F401
from app.models.contractor import ContractorContract  # noqa: F401
from app.models.legal import DocumentTemplate, LegalDocument  # noqa: F401
from app.models.audit import AuditLog  # noqa: F401
from app.models.billing import Invoice  # noqa: F401

# (Model, key_attr, data_attr, type_attr, name_attr|None, category)
SPECS = [
    (Document, "file_key", "file_data", "file_type", "file_name", "documents"),
    (Payment, "file_key", "file_data", "file_type", "file_name", "payments"),
    (Client, "ppjb_file_key", "ppjb_file_data", "ppjb_file_type", "ppjb_file_name", "clients"),
    (Client, "ajb_file_key", "ajb_file_data", "ajb_file_type", "ajb_file_name", "clients"),
    (TaxRecord, "file_key", "file_data", "file_type", "file_name", "tax"),
    (TaxRecord, "id_billing_file_key", "id_billing_file_data", "id_billing_file_type", "id_billing_file_name", "tax"),
    (TaxRecord, "validation_file_key", "validation_file_data", "validation_file_type", "validation_file_name", "tax"),
    (Project, "siteplan_key", "siteplan_data", "siteplan_type", None, "siteplan"),
]


async def migrate_spec(db, Model, key_attr, data_attr, type_attr, name_attr, category) -> int:
    key_c = getattr(Model, key_attr)
    data_c = getattr(Model, data_attr)
    type_c = getattr(Model, type_attr)
    name_c = getattr(Model, name_attr) if name_attr else None
    cols = [Model.id, Model.tenant_id, data_c, type_c] + ([name_c] if name_c is not None else [])
    rows = (await db.execute(select(*cols).where(data_c.isnot(None), key_c.is_(None)))).all()
    n = 0
    for row in rows:
        rid, tenant_id, data, ctype = row[0], row[1], row[2], row[3]
        fname = row[4] if name_c is not None else "siteplan"
        if data is None:
            continue
        key = storage.build_key(tenant_id, category, rid, fname)
        await storage.put(key, data, ctype)
        await db.execute(update(Model).where(Model.id == rid).values({key_attr: key, data_attr: None}))
        n += 1
    return n


async def main():
    total = 0
    async with AsyncSessionLocal() as db:
        for Model, key_attr, data_attr, type_attr, name_attr, category in SPECS:
            n = await migrate_spec(db, Model, key_attr, data_attr, type_attr, name_attr, category)
            if n:
                print(f"  {Model.__tablename__}.{data_attr}: {n} file dipindah ke MinIO")
            total += n
        await db.commit()
    print(f"SELESAI. Total {total} file dipindah ke MinIO (bucket {storage.BUCKET}).")


if __name__ == "__main__":
    asyncio.run(main())
