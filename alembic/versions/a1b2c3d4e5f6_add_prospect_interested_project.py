"""add prospect interested_project_id

Revision ID: a1b2c3d4e5f6
Revises: f3a4b5c6d7e8
Create Date: 2026-07-04 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f3a4b5c6d7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('prospects', sa.Column('interested_project_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_prospects_interested_project_id'), 'prospects', ['interested_project_id'], unique=False)
    op.create_foreign_key(None, 'prospects', 'projects', ['interested_project_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(None, 'prospects', type_='foreignkey')
    op.drop_index(op.f('ix_prospects_interested_project_id'), table_name='prospects')
    op.drop_column('prospects', 'interested_project_id')
