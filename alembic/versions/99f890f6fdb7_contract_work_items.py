"""borongan per bagian pekerjaan: tabel contract_work_items + expenses.work_item_id

Revision ID: 99f890f6fdb7
Revises: c8f111372be5
Create Date: 2026-07-13 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = '99f890f6fdb7'
down_revision: Union[str, None] = 'c8f111372be5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'contract_work_items',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('contract_id', UUID(as_uuid=True), sa.ForeignKey('contractor_contracts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('value', sa.Numeric(precision=15, scale=2), nullable=False, server_default='0'),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('ix_contract_work_items_tenant_id', 'contract_work_items', ['tenant_id'])
    op.create_index('ix_contract_work_items_contract_id', 'contract_work_items', ['contract_id'])

    op.add_column('expenses', sa.Column('work_item_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_expenses_work_item_id', 'expenses', 'contract_work_items',
                          ['work_item_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_expenses_work_item_id', 'expenses', ['work_item_id'])


def downgrade() -> None:
    op.drop_index('ix_expenses_work_item_id', table_name='expenses')
    op.drop_constraint('fk_expenses_work_item_id', 'expenses', type_='foreignkey')
    op.drop_column('expenses', 'work_item_id')
    op.drop_index('ix_contract_work_items_contract_id', table_name='contract_work_items')
    op.drop_index('ix_contract_work_items_tenant_id', table_name='contract_work_items')
    op.drop_table('contract_work_items')
