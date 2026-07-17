"""serah-terima dokumen asli: tabel document_handovers + enum handoverevent

Revision ID: 2fa0f401f514
Revises: b3948bea618e
Create Date: 2026-07-17 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision: str = '2fa0f401f514'
down_revision: Union[str, None] = 'b3948bea618e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Postgres enum menyimpan NAMA member (huruf besar) — samakan dgn pola enum lain di proyek ini
EVENT_VALUES = ('AMBIL', 'SERAH_NOTARIS', 'TERIMA_PEMBELI', 'TAHAN_BANK', 'KEMBALI_ARSIP')


def upgrade() -> None:
    # buat tipe enum SEKALI; kolom pakai create_type=False agar create_table tak membuatnya ulang
    postgresql.ENUM(*EVENT_VALUES, name='handoverevent').create(op.get_bind(), checkfirst=True)
    op.create_table(
        'document_handovers',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('document_id', UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event', postgresql.ENUM(*EVENT_VALUES, name='handoverevent', create_type=False), nullable=False),
        sa.Column('at', sa.Date(), nullable=False),
        sa.Column('by_user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('notary_id', UUID(as_uuid=True), sa.ForeignKey('notaries.id', ondelete='SET NULL'), nullable=True),
        sa.Column('bank_id', UUID(as_uuid=True), sa.ForeignKey('banks.id', ondelete='SET NULL'), nullable=True),
        sa.Column('client_id', UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='SET NULL'), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('proof_key', sa.String(length=600), nullable=True),
        sa.Column('proof_name', sa.String(length=255), nullable=True),
        sa.Column('proof_type', sa.String(length=100), nullable=True),
        sa.Column('proof_size', sa.Integer(), nullable=True),
    )
    op.create_index('ix_document_handovers_tenant_id', 'document_handovers', ['tenant_id'])
    op.create_index('ix_document_handovers_document_id', 'document_handovers', ['document_id'])


def downgrade() -> None:
    op.drop_index('ix_document_handovers_document_id', table_name='document_handovers')
    op.drop_index('ix_document_handovers_tenant_id', table_name='document_handovers')
    op.drop_table('document_handovers')
    postgresql.ENUM(*EVENT_VALUES, name='handoverevent').drop(op.get_bind(), checkfirst=True)
