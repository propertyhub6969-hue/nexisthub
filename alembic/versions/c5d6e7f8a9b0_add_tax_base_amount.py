"""add tax_records.base_amount (Nilai AJB / dasar pengenaan pajak)

Revision ID: c5d6e7f8a9b0
Revises: a4b5c6d7e8f9
Create Date: 2026-07-05 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5d6e7f8a9b0'
down_revision: Union[str, None] = 'a4b5c6d7e8f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tax_records', sa.Column('base_amount', sa.Numeric(precision=15, scale=2), nullable=True))


def downgrade() -> None:
    op.drop_column('tax_records', 'base_amount')
