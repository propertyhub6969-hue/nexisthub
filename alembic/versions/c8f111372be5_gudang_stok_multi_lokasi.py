"""gudang induk: tabel warehouses + stok multi-lokasi (project ATAU warehouse) + transfer

Revision ID: c8f111372be5
Revises: 797e6fdf80fd
Create Date: 2026-07-13 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'c8f111372be5'
down_revision: Union[str, None] = '797e6fdf80fd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Tabel gudang
    op.create_table(
        'warehouses',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
    )
    op.create_index('ix_warehouses_tenant_id', 'warehouses', ['tenant_id'])

    # 2) Stok jadi multi-lokasi: project_id boleh kosong bila lokasi = gudang
    op.alter_column('stock_movements', 'project_id', existing_type=UUID(as_uuid=True), nullable=True)
    op.add_column('stock_movements', sa.Column('warehouse_id', UUID(as_uuid=True), nullable=True))
    op.add_column('stock_movements', sa.Column('transfer_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_stock_movements_warehouse_id', 'stock_movements', 'warehouses',
                          ['warehouse_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_stock_movements_warehouse_id', 'stock_movements', ['warehouse_id'])
    op.create_index('ix_stock_movements_transfer_id', 'stock_movements', ['transfer_id'])

    # 3) PO bisa ditujukan ke gudang (alternatif project)
    op.add_column('purchase_orders', sa.Column('warehouse_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_purchase_orders_warehouse_id', 'purchase_orders', 'warehouses',
                          ['warehouse_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_purchase_orders_warehouse_id', 'purchase_orders', ['warehouse_id'])

    # 4) Sumber mutasi baru (ADD VALUE tak boleh di transaksi biasa → autocommit_block)
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE movementsource ADD VALUE IF NOT EXISTS 'TRANSFER_OUT'")
        op.execute("ALTER TYPE movementsource ADD VALUE IF NOT EXISTS 'TRANSFER_IN'")

    # Data lama aman: semua mutasi lama punya project_id → lokasi = proyek. Tak perlu backfill.


def downgrade() -> None:
    op.drop_index('ix_purchase_orders_warehouse_id', table_name='purchase_orders')
    op.drop_constraint('fk_purchase_orders_warehouse_id', 'purchase_orders', type_='foreignkey')
    op.drop_column('purchase_orders', 'warehouse_id')

    op.drop_index('ix_stock_movements_transfer_id', table_name='stock_movements')
    op.drop_index('ix_stock_movements_warehouse_id', table_name='stock_movements')
    op.drop_constraint('fk_stock_movements_warehouse_id', 'stock_movements', type_='foreignkey')
    op.drop_column('stock_movements', 'transfer_id')
    op.drop_column('stock_movements', 'warehouse_id')
    op.alter_column('stock_movements', 'project_id', existing_type=UUID(as_uuid=True), nullable=False)

    op.drop_index('ix_warehouses_tenant_id', table_name='warehouses')
    op.drop_table('warehouses')
    # nilai enum dibiarkan (Postgres tak mendukung DROP VALUE sederhana)
