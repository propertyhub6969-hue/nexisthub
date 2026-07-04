"""add audit_logs.reason (alasan edit/hapus pembayaran & termin)

Revision ID: f7e6d5c4b3a2
Revises: 9f8e7d6c5b4a
Create Date: 2026-07-04 22:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7e6d5c4b3a2'
down_revision: Union[str, None] = '9f8e7d6c5b4a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('audit_logs', sa.Column('reason', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('audit_logs', 'reason')
