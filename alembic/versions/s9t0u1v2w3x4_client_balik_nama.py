"""client: status balik nama sertifikat (milestone notaris)

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-07-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 's9t0u1v2w3x4'
down_revision: Union[str, None] = 'r8s9t0u1v2w3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    baliknama = postgresql.ENUM('BELUM', 'PROSES', 'SELESAI', name='baliknamastatus', create_type=False)
    baliknama.create(op.get_bind(), checkfirst=True)
    op.add_column('clients', sa.Column('balik_nama_status', baliknama, nullable=False, server_default='BELUM'))
    op.add_column('clients', sa.Column('balik_nama_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('clients', 'balik_nama_date')
    op.drop_column('clients', 'balik_nama_status')
    op.execute("DROP TYPE IF EXISTS baliknamastatus")
