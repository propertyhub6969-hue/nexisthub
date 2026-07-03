"""add lead temperature (kategori cold/warm/hot)

Revision ID: f3a4b5c6d7e8
Revises: e1f2a3b4c5d6
Create Date: 2026-07-04 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a4b5c6d7e8'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    temperature_enum = sa.Enum('COLD', 'WARM', 'HOT', name='leadtemperature')
    temperature_enum.create(op.get_bind(), checkfirst=True)
    op.add_column('leads', sa.Column('temperature', temperature_enum, nullable=True))


def downgrade() -> None:
    op.drop_column('leads', 'temperature')
    sa.Enum(name='leadtemperature').drop(op.get_bind(), checkfirst=True)
