"""add unit BAST fields (serah terima)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-04 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('units', sa.Column('bast_number', sa.String(length=50), nullable=True))
    op.add_column('units', sa.Column('bast_date', sa.Date(), nullable=True))
    op.add_column('units', sa.Column('bast_user_id', sa.UUID(), nullable=True))
    op.create_foreign_key(None, 'units', 'users', ['bast_user_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(None, 'units', type_='foreignkey')
    op.drop_column('units', 'bast_user_id')
    op.drop_column('units', 'bast_date')
    op.drop_column('units', 'bast_number')
