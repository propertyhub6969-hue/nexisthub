"""buku kas: kategori tersendiri "Biaya Notaris/Legal" + petakan ulang baris kas notaris

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-07-20 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 't0u1v2w3x4y5'
down_revision: Union[str, None] = 's9t0u1v2w3x4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # 1) Seed kategori 'biaya_notaris' utk SEMUA tenant yg sudah ada (idempotent via unique tenant+code).
    conn.execute(sa.text(
        "INSERT INTO account_categories (id, created_at, updated_at, is_deleted, tenant_id, name, direction, code) "
        "SELECT gen_random_uuid(), now(), now(), false, t.id, 'Biaya Notaris/Legal', 'OUT', 'biaya_notaris' FROM tenants t "
        "ON CONFLICT (tenant_id, code) DO NOTHING"
    ))
    # 2) Pindahkan baris kas biaya notaris yg sudah tercatat dari Biaya Operasional → Biaya Notaris/Legal.
    conn.execute(sa.text(
        "UPDATE cash_book_entries e SET category_id = ac.id "
        "FROM account_categories ac "
        "WHERE e.source_type = 'notary_fee' AND ac.tenant_id = e.tenant_id AND ac.code = 'biaya_notaris'"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    # Kembalikan baris kas notaris ke Biaya Operasional, lalu hapus kategori biaya_notaris.
    conn.execute(sa.text(
        "UPDATE cash_book_entries e SET category_id = ac.id "
        "FROM account_categories ac "
        "WHERE e.source_type = 'notary_fee' AND ac.tenant_id = e.tenant_id AND ac.code = 'biaya_operasional'"
    ))
    conn.execute(sa.text("DELETE FROM account_categories WHERE code = 'biaya_notaris'"))
