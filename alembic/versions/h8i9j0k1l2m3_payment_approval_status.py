"""persetujuan pembayaran (Fase A): enum paymentapprovalstatus + kolom di payments

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-07-19 09:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'h8i9j0k1l2m3'
down_revision: Union[str, None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STATUS_VALUES = ('PENDING', 'APPROVED', 'REJECTED')


def upgrade() -> None:
    postgresql.ENUM(*STATUS_VALUES, name='paymentapprovalstatus').create(op.get_bind(), checkfirst=True)
    # server_default='APPROVED' HANYA utk backfill kolom NOT NULL baru pada baris lama (pembayaran
    # historis dianggap sudah final, supaya angka laporan tak berubah). Insert baru dari aplikasi
    # selalu kirim nilai eksplisit (default PENDING di model Payment), server_default tak terpakai lagi setelahnya.
    op.add_column('payments', sa.Column(
        'approval_status', postgresql.ENUM(*STATUS_VALUES, name='paymentapprovalstatus', create_type=False),
        nullable=False, server_default='APPROVED'))
    op.add_column('payments', sa.Column('approver_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
    op.add_column('payments', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('payments', sa.Column('rejection_reason', sa.Text(), nullable=True))
    op.create_index('ix_payments_approver_id', 'payments', ['approver_id'])


def downgrade() -> None:
    op.drop_index('ix_payments_approver_id', table_name='payments')
    op.drop_column('payments', 'rejection_reason')
    op.drop_column('payments', 'approved_at')
    op.drop_column('payments', 'approver_id')
    op.drop_column('payments', 'approval_status')
    postgresql.ENUM(*STATUS_VALUES, name='paymentapprovalstatus').drop(op.get_bind(), checkfirst=True)
