"""tautan bank + kiriman menunggu persetujuan: bank_share_links, kpr_bank_submissions,
kolom PIC bank + file SP3K di kpr_applications

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-07-19 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'l2m3n4o5p6q7'
down_revision: Union[str, None] = 'k1l2m3n4o5p6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SUBMISSION_STATUS_VALUES = ('PENDING', 'ACCEPTED', 'REJECTED')
KPR_STAGE_VALUES = ('COLLECT_BERKAS', 'BERKAS_MASUK_BANK', 'SP3K', 'AKAD_KREDIT', 'PENCAIRAN')


def upgrade() -> None:
    # ── kolom baru di kpr_applications: PIC bank + ttd, file SP3K ──
    op.add_column('kpr_applications', sa.Column('pic_bank_name', sa.String(length=200), nullable=True))
    op.add_column('kpr_applications', sa.Column('pic_bank_signature', sa.Text(), nullable=True))
    op.add_column('kpr_applications', sa.Column('sp3k_file_name', sa.String(length=255), nullable=True))
    op.add_column('kpr_applications', sa.Column('sp3k_file_type', sa.String(length=100), nullable=True))
    op.add_column('kpr_applications', sa.Column('sp3k_file_size', sa.Integer(), nullable=True))
    op.add_column('kpr_applications', sa.Column('sp3k_file_key', sa.String(length=600), nullable=True))

    # ── bank_share_links ──
    op.create_table(
        'bank_share_links',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token', sa.String(length=64), nullable=False, unique=True),
        sa.Column('bank_id', UUID(as_uuid=True), sa.ForeignKey('banks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bank_name_snapshot', sa.String(length=200), nullable=True),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_accessed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('access_count', sa.Integer(), server_default='0', nullable=False),
    )
    op.create_index('ix_bank_share_links_tenant_id', 'bank_share_links', ['tenant_id'])
    op.create_index('ix_bank_share_links_bank_id', 'bank_share_links', ['bank_id'])
    op.create_index('ix_bank_share_links_token', 'bank_share_links', ['token'], unique=True)

    # ── kpr_bank_submissions ──
    postgresql.ENUM(*SUBMISSION_STATUS_VALUES, name='banksubmissionstatus').create(op.get_bind(), checkfirst=True)
    op.create_table(
        'kpr_bank_submissions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('tenant_id', UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kpr_application_id', UUID(as_uuid=True), sa.ForeignKey('kpr_applications.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bank_share_link_id', UUID(as_uuid=True), sa.ForeignKey('bank_share_links.id', ondelete='SET NULL'), nullable=True),
        sa.Column('submitted_stage', postgresql.ENUM(*KPR_STAGE_VALUES, name='kprstage', create_type=False), nullable=False),
        sa.Column('submitted_sp3k_number', sa.String(length=100), nullable=True),
        sa.Column('submitted_sp3k_date', sa.Date(), nullable=True),
        sa.Column('file_name', sa.String(length=255), nullable=True),
        sa.Column('file_type', sa.String(length=100), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('file_key', sa.String(length=600), nullable=True),
        sa.Column('status', postgresql.ENUM(*SUBMISSION_STATUS_VALUES, name='banksubmissionstatus', create_type=False), nullable=False, server_default='PENDING'),
        sa.Column('reviewed_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
    )
    op.create_index('ix_kpr_bank_submissions_tenant_id', 'kpr_bank_submissions', ['tenant_id'])
    op.create_index('ix_kpr_bank_submissions_kpr_application_id', 'kpr_bank_submissions', ['kpr_application_id'])


def downgrade() -> None:
    op.drop_index('ix_kpr_bank_submissions_kpr_application_id', table_name='kpr_bank_submissions')
    op.drop_index('ix_kpr_bank_submissions_tenant_id', table_name='kpr_bank_submissions')
    op.drop_table('kpr_bank_submissions')
    postgresql.ENUM(*SUBMISSION_STATUS_VALUES, name='banksubmissionstatus').drop(op.get_bind(), checkfirst=True)

    op.drop_index('ix_bank_share_links_token', table_name='bank_share_links')
    op.drop_index('ix_bank_share_links_bank_id', table_name='bank_share_links')
    op.drop_index('ix_bank_share_links_tenant_id', table_name='bank_share_links')
    op.drop_table('bank_share_links')

    op.drop_column('kpr_applications', 'sp3k_file_key')
    op.drop_column('kpr_applications', 'sp3k_file_size')
    op.drop_column('kpr_applications', 'sp3k_file_type')
    op.drop_column('kpr_applications', 'sp3k_file_name')
    op.drop_column('kpr_applications', 'pic_bank_signature')
    op.drop_column('kpr_applications', 'pic_bank_name')
