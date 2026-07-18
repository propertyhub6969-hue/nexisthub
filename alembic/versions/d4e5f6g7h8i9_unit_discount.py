"""diskon per unit: units.discount

Revision ID: d4e5f6g7h8i9
Revises: c3e4f5g6h7i8
Create Date: 2026-07-18 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6g7h8i9'
down_revision: Union[str, None] = 'c3e4f5g6h7i8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('units', sa.Column('discount', sa.Numeric(15, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('units', 'discount')
