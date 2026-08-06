"""tautan siteplan (agen) + permintaan booking unit

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
Create Date: 2026-08-04 06:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'w3x4y5z6a7b8'
down_revision: Union[str, None] = 'v2w3x4y5z6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BOOKING_STATUS = ('PENDING', 'ACCEPTED', 'REJECTED')


def upgrade() -> None:
    op.create_table(
        'siteplan_share_links',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token', sa.String(64), nullable=False, unique=True),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('project_name_snapshot', sa.String(200), nullable=True),
        sa.Column('label', sa.String(120), nullable=True),
        sa.Column('show_price', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_accessed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('access_count', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('ix_siteplan_share_links_tenant_id', 'siteplan_share_links', ['tenant_id'])
    op.create_index('ix_siteplan_share_links_token', 'siteplan_share_links', ['token'], unique=True)
    op.create_index('ix_siteplan_share_links_project_id', 'siteplan_share_links', ['project_id'])

    status = postgresql.ENUM(*BOOKING_STATUS, name='bookingrequeststatus', create_type=False)
    status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        'unit_booking_requests',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('share_link_id', UUID(as_uuid=True), sa.ForeignKey('siteplan_share_links.id', ondelete='SET NULL'), nullable=True),
        sa.Column('unit_id', UUID(as_uuid=True), sa.ForeignKey('units.id', ondelete='CASCADE'), nullable=False),
        sa.Column('agent_name', sa.String(150), nullable=False),
        sa.Column('agent_phone', sa.String(30), nullable=True),
        sa.Column('prospect_name', sa.String(150), nullable=True),
        sa.Column('prospect_phone', sa.String(30), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', status, nullable=False, server_default='PENDING'),
        sa.Column('reviewed_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('review_notes', sa.Text(), nullable=True),
    )
    op.create_index('ix_unit_booking_requests_tenant_id', 'unit_booking_requests', ['tenant_id'])
    op.create_index('ix_unit_booking_requests_unit_id', 'unit_booking_requests', ['unit_id'])
    op.create_index('ix_unit_booking_requests_status', 'unit_booking_requests', ['status'])
    op.create_index('ix_unit_booking_requests_share_link_id', 'unit_booking_requests', ['share_link_id'])


def downgrade() -> None:
    op.drop_table('unit_booking_requests')
    postgresql.ENUM(name='bookingrequeststatus').drop(op.get_bind(), checkfirst=True)
    op.drop_table('siteplan_share_links')
