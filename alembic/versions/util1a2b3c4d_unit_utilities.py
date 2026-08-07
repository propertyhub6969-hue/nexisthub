"""utilitas unit (PLN/PDAM) + kategori biaya Air/PDAM + tautan biaya

Revision ID: util1a2b3c4d
Revises: z6a7b8c9d0e1
Create Date: 2026-08-06 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'util1a2b3c4d'
down_revision: Union[str, None] = 'z6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KINDS = ('PLN', 'PDAM')
STATUSES = ('BELUM', 'DIAJUKAN', 'TERPASANG')


def upgrade() -> None:
    kind = postgresql.ENUM(*KINDS, name='utilitykind', create_type=False)
    kind.create(op.get_bind(), checkfirst=True)
    st = postgresql.ENUM(*STATUSES, name='utilitystatus', create_type=False)
    st.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'unit_utilities',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('unit_id', UUID(as_uuid=True), sa.ForeignKey('units.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', kind, nullable=False),
        sa.Column('status', st, nullable=False, server_default='BELUM'),
        sa.Column('customer_no', sa.String(60), nullable=True),
        sa.Column('power_va', sa.Integer(), nullable=True),
        sa.Column('applied_date', sa.Date(), nullable=True),
        sa.Column('installed_date', sa.Date(), nullable=True),
        sa.Column('cost', sa.Numeric(15, 2), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
    )
    op.create_index('ix_unit_utilities_tenant_id', 'unit_utilities', ['tenant_id'])
    op.create_index('ix_unit_utilities_unit_id', 'unit_utilities', ['unit_id'])
    op.create_index('ix_unit_utilities_status', 'unit_utilities', ['status'])
    # Satu unit hanya boleh punya SATU catatan per jenis utilitas (PLN/PDAM).
    op.create_unique_constraint('uq_unit_utilities_unit_kind', 'unit_utilities', ['unit_id', 'kind'])

    op.execute("ALTER TYPE expensecategory ADD VALUE IF NOT EXISTS 'AIR_PDAM'")
    op.add_column('expenses', sa.Column(
        'utility_id', UUID(as_uuid=True),
        sa.ForeignKey('unit_utilities.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_expenses_utility_id', 'expenses', ['utility_id'])


def downgrade() -> None:
    op.drop_index('ix_expenses_utility_id', table_name='expenses')
    op.drop_column('expenses', 'utility_id')
    op.drop_table('unit_utilities')
    postgresql.ENUM(name='utilitystatus').drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name='utilitykind').drop(op.get_bind(), checkfirst=True)
    # Nilai enum AIR_PDAM dibiarkan — Postgres tak bisa hapus 1 nilai tanpa rebuild tipe.
