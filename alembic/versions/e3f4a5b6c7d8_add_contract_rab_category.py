"""add contractor_contracts.rab_category (upah|kontraktor; default upah)

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-07-05 22:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('contractor_contracts', sa.Column('rab_category', sa.String(length=20), nullable=False, server_default='upah'))


def downgrade() -> None:
    op.drop_column('contractor_contracts', 'rab_category')
