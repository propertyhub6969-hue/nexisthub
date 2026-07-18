"""tautan bertoken utk bagikan Laporan Pajak Bulanan ke pihak luar (konsultan pajak)

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-07-18 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'e5f6g7h8i9j0'
down_revision: Union[str, None] = 'd4e5f6g7h8i9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'monthly_tax_share_links',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('month', sa.String(length=7), nullable=False),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=True),
        sa.Column('project_name_snapshot', sa.String(length=200), nullable=True),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_accessed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('access_count', sa.Integer(), server_default='0', nullable=False),
    )
    op.create_index('ix_monthly_tax_share_links_tenant_id', 'monthly_tax_share_links', ['tenant_id'])
    op.create_index('ix_monthly_tax_share_links_token', 'monthly_tax_share_links', ['token'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_monthly_tax_share_links_token', table_name='monthly_tax_share_links')
    op.drop_index('ix_monthly_tax_share_links_tenant_id', table_name='monthly_tax_share_links')
    op.drop_table('monthly_tax_share_links')
