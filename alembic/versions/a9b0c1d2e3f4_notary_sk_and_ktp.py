"""notaries: rename office -> sk_number, add ktp

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-07-05 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9b0c1d2e3f4'
down_revision: Union[str, None] = 'f8a9b0c1d2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('notaries', 'office', new_column_name='sk_number')
    op.add_column('notaries', sa.Column('ktp', sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column('notaries', 'ktp')
    op.alter_column('notaries', 'sk_number', new_column_name='office')
