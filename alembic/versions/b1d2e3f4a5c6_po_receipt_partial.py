"""penerimaan PO parsial: stock_movements po_item_id + do_number, postatus PARTIAL

Revision ID: b1d2e3f4a5c6
Revises: f4a5b6c7d8e9
Create Date: 2026-07-07 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'b1d2e3f4a5c6'
down_revision: Union[str, None] = 'f4a5b6c7d8e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # kolom penerimaan PO di kartu stok
    op.add_column('stock_movements', sa.Column('po_item_id', UUID(as_uuid=True), nullable=True))
    op.add_column('stock_movements', sa.Column('do_number', sa.String(length=50), nullable=True))
    op.create_foreign_key(
        'fk_stock_movements_po_item_id', 'stock_movements', 'purchase_order_items',
        ['po_item_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_stock_movements_po_item_id', 'stock_movements', ['po_item_id'])

    # tambah label enum 'PARTIAL' (SQLAlchemy menyimpan NAMA member = huruf besar).
    # ADD VALUE tak boleh di dalam transaksi biasa -> pakai autocommit_block.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE postatus ADD VALUE IF NOT EXISTS 'PARTIAL'")


def downgrade() -> None:
    op.drop_index('ix_stock_movements_po_item_id', table_name='stock_movements')
    op.drop_constraint('fk_stock_movements_po_item_id', 'stock_movements', type_='foreignkey')
    op.drop_column('stock_movements', 'do_number')
    op.drop_column('stock_movements', 'po_item_id')
    # nilai enum 'PARTIAL' dibiarkan (Postgres tak mendukung DROP VALUE sederhana)
