"""add project siteplan image columns

Revision ID: c4d5e6f7a8b9
Revises: e30e2d22800a
Create Date: 2026-07-02 20:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, None] = 'e30e2d22800a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('siteplan_type', sa.String(length=100), nullable=True))
    op.add_column('projects', sa.Column('siteplan_size', sa.Integer(), nullable=True))
    op.add_column('projects', sa.Column('siteplan_data', sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'siteplan_data')
    op.drop_column('projects', 'siteplan_size')
    op.drop_column('projects', 'siteplan_type')
