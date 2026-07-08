"""billing manual: tabel invoices

Revision ID: b1c2d3e4f5a6
Revises: d3e4f5a6b7c8
Create Date: 2026-07-07 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    status = sa.Enum('UNPAID', 'PAID', 'VOID', name='invoicestatus')
    op.create_table(
        'invoices',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('plan', sa.String(50), nullable=True),
        sa.Column('amount', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('status', status, nullable=False, server_default='UNPAID'),
        sa.Column('method', sa.String(50), nullable=True),
        sa.Column('paid_at', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_invoices_tenant_id', 'invoices', ['tenant_id'])


def downgrade() -> None:
    op.drop_table('invoices')
    op.execute('DROP TYPE IF EXISTS invoicestatus')
