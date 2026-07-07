"""add units.price_breakdown (rincian harga: Harga Dasar, Hook, Lebih Tanah, Booking Fee, dll)

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-07-05 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b0c1d2e3f4a5'
down_revision: Union[str, None] = 'a9b0c1d2e3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('units', sa.Column('price_breakdown', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('units', 'price_breakdown')
