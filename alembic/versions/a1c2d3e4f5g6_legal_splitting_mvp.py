"""legal splitting MVP: documents.project_id/parent_document_id/expiry_date + certificate_split_batches(+items) + expenses.split_batch_id

Revision ID: a1c2d3e4f5g6
Revises: eefeccbad47a
Create Date: 2026-07-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'a1c2d3e4f5g6'
down_revision: Union[str, None] = 'eefeccbad47a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Postgres enum menyimpan NAMA member (huruf besar) — samakan dgn pola enum lain di proyek ini
STATUS_VALUES = ('DIAJUKAN', 'PENGUKURAN', 'SK_TERBIT', 'SELESAI', 'DITOLAK')


def upgrade() -> None:
    # ── documents: perluasan utk perizinan proyek & sertifikat induk→pecahan ──
    op.add_column('documents', sa.Column(
        'project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=True))
    op.add_column('documents', sa.Column(
        'parent_document_id', UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='SET NULL'), nullable=True))
    op.add_column('documents', sa.Column('expiry_date', sa.Date(), nullable=True))
    op.create_index('ix_documents_project_id', 'documents', ['project_id'])
    op.create_index('ix_documents_parent_document_id', 'documents', ['parent_document_id'])

    # ── certificate_split_batches ──
    postgresql.ENUM(*STATUS_VALUES, name='splitbatchstatus').create(op.get_bind(), checkfirst=True)
    op.create_table(
        'certificate_split_batches',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('master_document_id', UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('batch_number', sa.String(length=50), nullable=True),
        sa.Column('status', postgresql.ENUM(*STATUS_VALUES, name='splitbatchstatus', create_type=False), nullable=False),
        sa.Column('submitted_date', sa.Date(), nullable=True),
        sa.Column('sk_number', sa.String(length=100), nullable=True),
        sa.Column('sk_date', sa.Date(), nullable=True),
        sa.Column('sk_file_key', sa.String(length=600), nullable=True),
        sa.Column('sk_file_name', sa.String(length=255), nullable=True),
        sa.Column('sk_file_type', sa.String(length=100), nullable=True),
        sa.Column('sk_file_size', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
    )
    op.create_index('ix_certificate_split_batches_tenant_id', 'certificate_split_batches', ['tenant_id'])
    op.create_index('ix_certificate_split_batches_project_id', 'certificate_split_batches', ['project_id'])
    op.create_index('ix_certificate_split_batches_master_document_id', 'certificate_split_batches', ['master_document_id'])

    # ── certificate_split_batch_items ──
    op.create_table(
        'certificate_split_batch_items',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('batch_id', UUID(as_uuid=True), sa.ForeignKey('certificate_split_batches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('unit_id', UUID(as_uuid=True), sa.ForeignKey('units.id', ondelete='CASCADE'), nullable=False),
        sa.Column('result_document_id', UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_certificate_split_batch_items_batch_id', 'certificate_split_batch_items', ['batch_id'])
    op.create_index('ix_certificate_split_batch_items_unit_id', 'certificate_split_batch_items', ['unit_id'])

    # ── expenses: tautan opsional ke batch pemecahan ──
    op.add_column('expenses', sa.Column(
        'split_batch_id', UUID(as_uuid=True), sa.ForeignKey('certificate_split_batches.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_expenses_split_batch_id', 'expenses', ['split_batch_id'])


def downgrade() -> None:
    op.drop_index('ix_expenses_split_batch_id', table_name='expenses')
    op.drop_column('expenses', 'split_batch_id')

    op.drop_index('ix_certificate_split_batch_items_unit_id', table_name='certificate_split_batch_items')
    op.drop_index('ix_certificate_split_batch_items_batch_id', table_name='certificate_split_batch_items')
    op.drop_table('certificate_split_batch_items')

    op.drop_index('ix_certificate_split_batches_master_document_id', table_name='certificate_split_batches')
    op.drop_index('ix_certificate_split_batches_project_id', table_name='certificate_split_batches')
    op.drop_index('ix_certificate_split_batches_tenant_id', table_name='certificate_split_batches')
    op.drop_table('certificate_split_batches')
    postgresql.ENUM(*STATUS_VALUES, name='splitbatchstatus').drop(op.get_bind(), checkfirst=True)

    op.drop_index('ix_documents_parent_document_id', table_name='documents')
    op.drop_index('ix_documents_project_id', table_name='documents')
    op.drop_column('documents', 'expiry_date')
    op.drop_column('documents', 'parent_document_id')
    op.drop_column('documents', 'project_id')
