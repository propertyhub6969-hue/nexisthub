"""opname borongan: kolom expenses.paid_at (tgl dibayar) + backfill opname historis

Revision ID: c725295102c8
Revises: 51da134c7b6b
Create Date: 2026-07-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c725295102c8'
down_revision: Union[str, None] = '51da134c7b6b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('expenses', sa.Column('paid_at', sa.Date(), nullable=True))
    # Opname lama semuanya dibuat is_paid=True → dianggap sudah dibayar; beri tanggal dari expense_date.
    op.execute("UPDATE expenses SET paid_at = expense_date WHERE contract_id IS NOT NULL AND is_paid = true")


def downgrade() -> None:
    op.drop_column('expenses', 'paid_at')
