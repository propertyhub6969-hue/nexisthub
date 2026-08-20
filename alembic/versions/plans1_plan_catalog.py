"""plan catalog + seed 3 paket

Revision ID: plans1
Revises: xendit1
Create Date: 2026-08-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
import json

revision = "plans1"
down_revision = "xendit1"
branch_labels = None
depends_on = None

_SEED = [
    ("Inti", 1250000, "/bulan", "Untuk developer rumah subsidi.",
     ["Properti, unit & siteplan interaktif", "Marketing (CRM) & pembayaran termin", "KPR, notaris & dokumen legalitas",
      "Keuangan lengkap & laporan", "s/d 3 proyek aktif"], False, 1),
    ("Bisnis", 2500000, "/bulan", "Developer multi-proyek dengan tim lebih besar.",
     ["Semua fitur paket Inti", "Proyek tak terbatas", "Ekualisasi pajak & posisi keuangan", "Prioritas dukungan"], True, 2),
    ("Enterprise", None, "Hubungi kami", "Kebutuhan khusus & skala besar.",
     ["Semua fitur paket Bisnis", "Kustomisasi & integrasi", "Onboarding & pendampingan khusus", "SLA khusus"], False, 3),
]


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("price", sa.Numeric(14, 2), nullable=True),
        sa.Column("price_note", sa.String(60), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("features", JSONB(), nullable=True),
        sa.Column("highlight", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    for name, price, note, desc, feats, hl, order in _SEED:
        op.execute(sa.text(
            "INSERT INTO plans (id, name, price, price_note, description, features, highlight, is_active, sort_order, created_at, updated_at) "
            "VALUES (gen_random_uuid(), :n, :p, :note, :d, CAST(:f AS jsonb), :hl, true, :o, now(), now())"
        ).bindparams(n=name, p=price, note=note, d=desc, f=json.dumps(feats), hl=hl, o=order))


def downgrade() -> None:
    op.drop_table("plans")
