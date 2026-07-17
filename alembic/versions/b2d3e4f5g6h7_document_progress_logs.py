"""riwayat tahapan proses dokumen: tabel document_progress_logs + enum progressevent

Revision ID: b2d3e4f5g6h7
Revises: a1c2d3e4f5g6
Create Date: 2026-07-17 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'b2d3e4f5g6h7'
down_revision: Union[str, None] = 'a1c2d3e4f5g6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Postgres enum menyimpan NAMA member (huruf besar) — samakan dgn pola enum lain di proyek ini
EVENT_VALUES = ('DIAJUKAN', 'DIPROSES', 'REVISI', 'DITOLAK', 'TERBIT')


def upgrade() -> None:
    postgresql.ENUM(*EVENT_VALUES, name='progressevent').create(op.get_bind(), checkfirst=True)
    op.create_table(
        'document_progress_logs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('document_id', UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event', postgresql.ENUM(*EVENT_VALUES, name='progressevent', create_type=False), nullable=False),
        sa.Column('event_date', sa.Date(), nullable=False),
        sa.Column('institution', sa.String(length=200), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('by_user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_document_progress_logs_tenant_id', 'document_progress_logs', ['tenant_id'])
    op.create_index('ix_document_progress_logs_document_id', 'document_progress_logs', ['document_id'])


def downgrade() -> None:
    op.drop_index('ix_document_progress_logs_document_id', table_name='document_progress_logs')
    op.drop_index('ix_document_progress_logs_tenant_id', table_name='document_progress_logs')
    op.drop_table('document_progress_logs')
    postgresql.ENUM(*EVENT_VALUES, name='progressevent').drop(op.get_bind(), checkfirst=True)
