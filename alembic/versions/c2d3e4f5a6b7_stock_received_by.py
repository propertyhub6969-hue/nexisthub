"""PIC penerima PO: stock_movements.received_by_id

Revision ID: c2d3e4f5a6b7
Revises: b1d2e3f4a5c6
Create Date: 2026-07-07 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = 'b1d2e3f4a5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('stock_movements', sa.Column('received_by_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_stock_movements_received_by_id', 'stock_movements', 'users',
        ['received_by_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_stock_movements_received_by_id', 'stock_movements', type_='foreignkey')
    op.drop_column('stock_movements', 'received_by_id')
