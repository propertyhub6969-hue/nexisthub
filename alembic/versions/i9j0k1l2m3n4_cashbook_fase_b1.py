"""Buku Kas ringan (Fase B1): account_categories + cash_book_entries + seed 6 kategori dasar

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-07-19 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'i9j0k1l2m3n4'
down_revision: Union[str, None] = 'h8i9j0k1l2m3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DIRECTION_VALUES = ('IN', 'OUT')

# (code, name, direction) — samakan dgn app/core/cashbook.py DEFAULT_CATEGORIES
DEFAULT_CATEGORIES = [
    ('kas_bank', 'Kas/Bank', 'IN'),
    ('piutang_pembeli', 'Piutang Pembeli', 'IN'),
    ('pendapatan_penjualan', 'Pendapatan Penjualan', 'IN'),
    ('ppn_keluaran', 'PPN Keluaran', 'IN'),
    ('retensi_bank', 'Retensi Bank', 'IN'),
    ('biaya_operasional', 'Biaya Operasional', 'OUT'),
]


def upgrade() -> None:
    postgresql.ENUM(*DIRECTION_VALUES, name='cashdirection').create(op.get_bind(), checkfirst=True)

    op.create_table(
        'account_categories',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('direction', postgresql.ENUM(*DIRECTION_VALUES, name='cashdirection', create_type=False), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.UniqueConstraint('tenant_id', 'code', name='uq_account_categories_tenant_code'),
    )
    op.create_index('ix_account_categories_tenant_id', 'account_categories', ['tenant_id'])

    op.create_table(
        'cash_book_entries',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('direction', postgresql.ENUM(*DIRECTION_VALUES, name='cashdirection', create_type=False), nullable=False),
        sa.Column('amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('category_id', UUID(as_uuid=True), sa.ForeignKey('account_categories.id', ondelete='SET NULL'), nullable=True),
        sa.Column('source_type', sa.String(length=20), nullable=False),
        sa.Column('source_id', UUID(as_uuid=True), nullable=False),
        sa.Column('description', sa.String(length=300), nullable=False),
        sa.Column('client_id', UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='SET NULL'), nullable=True),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='SET NULL'), nullable=True),
        sa.UniqueConstraint('source_type', 'source_id', name='uq_cash_book_entries_source'),
    )
    op.create_index('ix_cash_book_entries_tenant_id', 'cash_book_entries', ['tenant_id'])
    op.create_index('ix_cash_book_entries_category_id', 'cash_book_entries', ['category_id'])
    op.create_index('ix_cash_book_entries_source_id', 'cash_book_entries', ['source_id'])
    op.create_index('ix_cash_book_entries_client_id', 'cash_book_entries', ['client_id'])
    op.create_index('ix_cash_book_entries_project_id', 'cash_book_entries', ['project_id'])

    # Seed 6 kategori dasar utk SEMUA tenant yang sudah ada (tenant baru di-seed dari app saat provisioning).
    conn = op.get_bind()
    for code, name, direction in DEFAULT_CATEGORIES:
        conn.execute(sa.text(
            "INSERT INTO account_categories (id, created_at, updated_at, is_deleted, tenant_id, name, direction, code) "
            "SELECT gen_random_uuid(), now(), now(), false, t.id, :name, :direction, :code FROM tenants t"
        ), {"name": name, "direction": direction, "code": code})


def downgrade() -> None:
    op.drop_index('ix_cash_book_entries_project_id', table_name='cash_book_entries')
    op.drop_index('ix_cash_book_entries_client_id', table_name='cash_book_entries')
    op.drop_index('ix_cash_book_entries_source_id', table_name='cash_book_entries')
    op.drop_index('ix_cash_book_entries_category_id', table_name='cash_book_entries')
    op.drop_index('ix_cash_book_entries_tenant_id', table_name='cash_book_entries')
    op.drop_table('cash_book_entries')
    op.drop_index('ix_account_categories_tenant_id', table_name='account_categories')
    op.drop_table('account_categories')
    postgresql.ENUM(*DIRECTION_VALUES, name='cashdirection').drop(op.get_bind(), checkfirst=True)
