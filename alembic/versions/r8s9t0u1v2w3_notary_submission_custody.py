"""kiriman notaris: kejadian serah-terima dokumen asli (kind=custody)

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-07-20 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'r8s9t0u1v2w3'
down_revision: Union[str, None] = 'q7r8s9t0u1v2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE notarysubmissionkind ADD VALUE IF NOT EXISTS 'CUSTODY'")
    op.add_column('notary_submissions', sa.Column('custody_document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='SET NULL'), nullable=True))
    op.add_column('notary_submissions', sa.Column('custody_event', postgresql.ENUM('AMBIL', 'SERAH_NOTARIS', 'TERIMA_PEMBELI', 'TAHAN_BANK', 'KEMBALI_ARSIP', name='handoverevent', create_type=False), nullable=True))
    op.add_column('notary_submissions', sa.Column('custody_at', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('notary_submissions', 'custody_at')
    op.drop_column('notary_submissions', 'custody_event')
    op.drop_column('notary_submissions', 'custody_document_id')
    # NB: Postgres tak bisa hapus 1 nilai enum tanpa rebuild tipe — CUSTODY dibiarkan ada (aman, tak dipakai lagi).
