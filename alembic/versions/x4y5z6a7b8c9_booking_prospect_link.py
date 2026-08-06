"""booking: tautan ke prospek yang dibuat otomatis saat diterima

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b8
Create Date: 2026-08-06 07:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'x4y5z6a7b8c9'
down_revision: Union[str, None] = 'w3x4y5z6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('unit_booking_requests',
                  sa.Column('prospect_id', UUID(as_uuid=True),
                            sa.ForeignKey('prospects.id', ondelete='SET NULL'), nullable=True))


def downgrade() -> None:
    op.drop_column('unit_booking_requests', 'prospect_id')
