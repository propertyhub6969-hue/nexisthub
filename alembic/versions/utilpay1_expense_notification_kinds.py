"""Tambah jenis notifikasi biaya diajukan/dibayar

Biaya utilitas kini lahir berstatus DIAJUKAN dan menunggu keuangan menandainya lunas,
jadi perlu dua jenis notifikasi baru.

★ Enum SQLAlchemy menyimpan .name (UPPERCASE), bukan .value — lihat konvensi di model.

Revision ID: utilpay1
Revises: util1a2b3c4d
"""
from alembic import op

revision = "utilpay1"
down_revision = "util1a2b3c4d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD VALUE tak bisa jalan di dalam blok transaksi pada Postgres lama; autocommit aman.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notificationkind ADD VALUE IF NOT EXISTS 'EXPENSE_SUBMITTED'")
        op.execute("ALTER TYPE notificationkind ADD VALUE IF NOT EXISTS 'EXPENSE_PAID'")


def downgrade() -> None:
    # Postgres tak mendukung DROP VALUE pada enum — nilai dibiarkan (tak mengganggu).
    pass
