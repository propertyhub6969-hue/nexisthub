"""pindah No. SiKasep/SiKumbang dari kpr_applications ke documents (per-unit, spt SHM/PBB)

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-07-19 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'j0k1l2m3n4o5'
down_revision: Union[str, None] = 'i9j0k1l2m3n4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # Migrasi data: tiap KPR yang punya sikasep_number & pembelinya punya unit → jadi 1 baris Document
    # (doc_type='No. SiKasep/SiKumbang', status=TERBIT karena nomornya sudah ada), lalu kolom lama dibuang.
    conn.execute(sa.text("""
        INSERT INTO documents (id, created_at, updated_at, is_deleted, tenant_id, unit_id, doc_type, name, status)
        SELECT gen_random_uuid(), now(), now(), false, k.tenant_id, c.unit_id, 'No. SiKasep/SiKumbang', k.sikasep_number, 'TERBIT'
        FROM kpr_applications k JOIN clients c ON c.id = k.client_id
        WHERE k.sikasep_number IS NOT NULL AND k.sikasep_number != '' AND k.is_deleted = false AND c.unit_id IS NOT NULL
    """))
    op.drop_column('kpr_applications', 'sikasep_number')


def downgrade() -> None:
    op.add_column('kpr_applications', sa.Column('sikasep_number', sa.String(length=100), nullable=True))
    # data yang sudah dipindah ke documents sengaja tak ditarik balik otomatis (downgrade jarang dipakai)
