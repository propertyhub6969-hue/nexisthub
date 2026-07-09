"""log progres mingguan konstruksi berfoto (riwayat, tak menimpa)

Revision ID: 51da134c7b6b
Revises: ba01633f14ae
Create Date: 2026-07-09 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision: str = '51da134c7b6b'
down_revision: Union[str, None] = 'ba01633f14ae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'construction_progress_logs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('unit_id', UUID(as_uuid=True), sa.ForeignKey('units.id', ondelete='CASCADE'), nullable=False),
        sa.Column('log_date', sa.Date(), nullable=False),
        sa.Column('stage', postgresql.ENUM('PERSIAPAN', 'PONDASI', 'STRUKTUR', 'DINDING', 'ATAP', 'FINISHING', 'SELESAI',
                                            name='constructionstage', create_type=False), nullable=True),
        sa.Column('percent', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('uploaded_by_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('photo_key', sa.String(length=600), nullable=True),
        sa.Column('photo_name', sa.String(length=255), nullable=True),
        sa.Column('photo_type', sa.String(length=100), nullable=True),
        sa.Column('photo_size', sa.Integer(), nullable=True),
    )
    op.create_index('ix_construction_progress_logs_tenant_id', 'construction_progress_logs', ['tenant_id'])
    op.create_index('ix_construction_progress_logs_unit_id', 'construction_progress_logs', ['unit_id'])


def downgrade() -> None:
    op.drop_index('ix_construction_progress_logs_unit_id', table_name='construction_progress_logs')
    op.drop_index('ix_construction_progress_logs_tenant_id', table_name='construction_progress_logs')
    op.drop_table('construction_progress_logs')
