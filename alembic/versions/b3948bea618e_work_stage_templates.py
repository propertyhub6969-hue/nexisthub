"""template tahapan borongan: work_stage_templates + work_stage_template_lines

Revision ID: b3948bea618e
Revises: 99f890f6fdb7
Create Date: 2026-07-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'b3948bea618e'
down_revision: Union[str, None] = '99f890f6fdb7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'work_stage_templates',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('mode', sa.String(length=10), server_default='rp', nullable=False),
    )
    op.create_index('ix_work_stage_templates_tenant_id', 'work_stage_templates', ['tenant_id'])

    op.create_table(
        'work_stage_template_lines',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('template_id', UUID(as_uuid=True), sa.ForeignKey('work_stage_templates.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('value', sa.Numeric(precision=15, scale=2), server_default='0', nullable=False),
        sa.Column('position', sa.Integer(), server_default='0', nullable=False),
    )
    op.create_index('ix_work_stage_template_lines_tenant_id', 'work_stage_template_lines', ['tenant_id'])
    op.create_index('ix_work_stage_template_lines_template_id', 'work_stage_template_lines', ['template_id'])


def downgrade() -> None:
    op.drop_index('ix_work_stage_template_lines_template_id', table_name='work_stage_template_lines')
    op.drop_index('ix_work_stage_template_lines_tenant_id', table_name='work_stage_template_lines')
    op.drop_table('work_stage_template_lines')
    op.drop_index('ix_work_stage_templates_tenant_id', table_name='work_stage_templates')
    op.drop_table('work_stage_templates')
