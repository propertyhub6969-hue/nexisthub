"""kolom catatan dari bank saat kirim (kurang berkas/ditolak/dll)

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-07-19 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'm3n4o5p6q7r8'
down_revision: Union[str, None] = 'l2m3n4o5p6q7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('kpr_bank_submissions', sa.Column('submitted_notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('kpr_bank_submissions', 'submitted_notes')
