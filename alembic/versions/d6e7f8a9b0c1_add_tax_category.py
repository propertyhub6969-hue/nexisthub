"""add tax_records.category (subsidi/komersial); default komersial

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-07-05 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd6e7f8a9b0c1'
down_revision: Union[str, None] = 'c5d6e7f8a9b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # data lama = komersial (rumus PPh 2.5% yg sudah dikerjakan)
    op.add_column('tax_records', sa.Column('category', sa.String(length=20), nullable=False, server_default='komersial'))


def downgrade() -> None:
    op.drop_column('tax_records', 'category')
