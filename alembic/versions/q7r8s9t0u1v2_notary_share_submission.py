"""tautan bagikan-ke-notaris + kiriman menunggu persetujuan (PPJB/AJB, pajak, biaya notaris)

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-07-19 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'q7r8s9t0u1v2'
down_revision: Union[str, None] = 'p6q7r8s9t0u1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NB: nilai enum Postgres HARUS nama anggota Python (huruf besar), bukan .value — SQLAlchemy
    # Enum(PyEnumClass) default menyimpan berdasar .name (samakan dgn taxtype/taxstatus/banksubmissionstatus
    # yang sudah ada: 'PPH'/'BELUM'/'PENDING' dst, terverifikasi lewat query enum_range() di DB live).
    notary_submission_kind = postgresql.ENUM('PPJB_AJB', 'TAX', 'FEE', name='notarysubmissionkind')
    notary_submission_kind.create(op.get_bind(), checkfirst=True)
    notary_submission_status = postgresql.ENUM('PENDING', 'ACCEPTED', 'REJECTED', name='notarysubmissionstatus')
    notary_submission_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'notary_share_links',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token', sa.String(64), nullable=False, unique=True),
        sa.Column('notary_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('notaries.id', ondelete='CASCADE'), nullable=False),
        sa.Column('notary_name_snapshot', sa.String(200), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_accessed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('access_count', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('ix_notary_share_links_tenant_id', 'notary_share_links', ['tenant_id'])
    op.create_index('ix_notary_share_links_token', 'notary_share_links', ['token'])
    op.create_index('ix_notary_share_links_notary_id', 'notary_share_links', ['notary_id'])

    op.create_table(
        'notary_submissions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('notary_share_link_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('notary_share_links.id', ondelete='SET NULL'), nullable=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', postgresql.ENUM('PPJB_AJB', 'TAX', 'FEE', name='notarysubmissionkind', create_type=False), nullable=False),
        sa.Column('target_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('ppjb_number', sa.String(100), nullable=True),
        sa.Column('ppjb_file_name', sa.String(255), nullable=True),
        sa.Column('ppjb_file_type', sa.String(100), nullable=True),
        sa.Column('ppjb_file_size', sa.Integer(), nullable=True),
        sa.Column('ppjb_file_key', sa.String(600), nullable=True),
        sa.Column('ajb_number', sa.String(100), nullable=True),
        sa.Column('ajb_file_name', sa.String(255), nullable=True),
        sa.Column('ajb_file_type', sa.String(100), nullable=True),
        sa.Column('ajb_file_size', sa.Integer(), nullable=True),
        sa.Column('ajb_file_key', sa.String(600), nullable=True),
        sa.Column('tax_type', postgresql.ENUM('PPH', 'BPHTB', 'PPN', name='taxtype', create_type=False), nullable=True),
        sa.Column('tax_category', sa.String(20), nullable=True),
        sa.Column('tax_base_amount', sa.Numeric(15, 2), nullable=True),
        sa.Column('tax_amount', sa.Numeric(15, 2), nullable=True),
        sa.Column('tax_id_billing', sa.String(50), nullable=True),
        sa.Column('tax_ntpn', sa.String(50), nullable=True),
        sa.Column('tax_date', sa.Date(), nullable=True),
        sa.Column('tax_status', postgresql.ENUM('BELUM', 'DIBAYAR', 'VALIDASI', 'DTP', 'BEBAS', name='taxstatus', create_type=False), nullable=True),
        sa.Column('fee_description', sa.String(200), nullable=True),
        sa.Column('fee_amount', sa.Numeric(15, 2), nullable=True),
        sa.Column('fee_date', sa.Date(), nullable=True),
        sa.Column('file_name', sa.String(255), nullable=True),
        sa.Column('file_type', sa.String(100), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('file_key', sa.String(600), nullable=True),
        sa.Column('submitted_notes', sa.Text(), nullable=True),
        sa.Column('status', postgresql.ENUM('PENDING', 'ACCEPTED', 'REJECTED', name='notarysubmissionstatus', create_type=False), nullable=False, server_default='PENDING'),
        sa.Column('reviewed_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('review_notes', sa.Text(), nullable=True),
    )
    op.create_index('ix_notary_submissions_tenant_id', 'notary_submissions', ['tenant_id'])
    op.create_index('ix_notary_submissions_client_id', 'notary_submissions', ['client_id'])


def downgrade() -> None:
    op.drop_table('notary_submissions')
    op.drop_table('notary_share_links')
    postgresql.ENUM(name='notarysubmissionstatus').drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name='notarysubmissionkind').drop(op.get_bind(), checkfirst=True)
