"""Tambah kolom paid_at pada notary_fees

Biaya notaris kini ikut antrean validasi keuangan. Tanggal bayar sebenarnya sering
beda dari fee_date (tanggal jasa), jadi kas keluarnya perlu tanggal sendiri.

Revision ID: notarypaid1
Revises: utilpay1
"""
import sqlalchemy as sa
from alembic import op

revision = "notarypaid1"
down_revision = "utilpay1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notary_fees", sa.Column("paid_at", sa.Date(), nullable=True))
    # Baris yang terlanjur lunas: pakai fee_date sbg tanggal bayar supaya baris Buku Kas
    # yang sudah ada tidak berpindah tanggal saat disinkronkan ulang.
    op.execute("UPDATE notary_fees SET paid_at = fee_date WHERE is_paid = true AND paid_at IS NULL")


def downgrade() -> None:
    op.drop_column("notary_fees", "paid_at")
