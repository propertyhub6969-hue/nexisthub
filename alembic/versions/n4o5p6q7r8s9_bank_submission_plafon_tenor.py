"""kolom plafon & tenor yang dikirim bank (bisa berubah dari sisi bank)

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-07-19 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'n4o5p6q7r8s9'
down_revision: Union[str, None] = 'm3n4o5p6q7r8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('kpr_bank_submissions', sa.Column('submitted_plafond', sa.Numeric(15, 2), nullable=True))
    op.add_column('kpr_bank_submissions', sa.Column('submitted_tenor_months', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('kpr_bank_submissions', 'submitted_tenor_months')
    op.drop_column('kpr_bank_submissions', 'submitted_plafond')
