"""biaya perizinan tertaut ke tahapan: expenses.permit_log_id

Revision ID: c3e4f5g6h7i8
Revises: b2d3e4f5g6h7
Create Date: 2026-07-18 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'c3e4f5g6h7i8'
down_revision: Union[str, None] = 'b2d3e4f5g6h7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('expenses', sa.Column(
        'permit_log_id', UUID(as_uuid=True),
        sa.ForeignKey('document_progress_logs.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_expenses_permit_log_id', 'expenses', ['permit_log_id'])


def downgrade() -> None:
    op.drop_index('ix_expenses_permit_log_id', table_name='expenses')
    op.drop_column('expenses', 'permit_log_id')
