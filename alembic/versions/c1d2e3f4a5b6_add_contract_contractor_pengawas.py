"""add contractor_contracts.contractor_name & pengawas (isian bebas, bukan dari vendor)

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-07-05 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b0c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('contractor_contracts', sa.Column('contractor_name', sa.String(length=200), nullable=True))
    op.add_column('contractor_contracts', sa.Column('pengawas', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('contractor_contracts', 'pengawas')
    op.drop_column('contractor_contracts', 'contractor_name')
