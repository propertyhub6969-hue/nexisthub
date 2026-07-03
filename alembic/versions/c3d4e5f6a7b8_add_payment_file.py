"""add payment bukti transfer file columns

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('payments', sa.Column('file_name', sa.String(length=255), nullable=True))
    op.add_column('payments', sa.Column('file_type', sa.String(length=100), nullable=True))
    op.add_column('payments', sa.Column('file_size', sa.Integer(), nullable=True))
    op.add_column('payments', sa.Column('file_data', sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column('payments', 'file_data')
    op.drop_column('payments', 'file_size')
    op.drop_column('payments', 'file_type')
    op.drop_column('payments', 'file_name')
