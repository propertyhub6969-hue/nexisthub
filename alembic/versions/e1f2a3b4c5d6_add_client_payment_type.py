"""add client payment_type (cara beli)

Revision ID: e1f2a3b4c5d6
Revises: d7e8f9a0b1c2
Create Date: 2026-07-03 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd7e8f9a0b1c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    payment_type_enum = sa.Enum('CASH', 'KPR', name='clientpaymenttype')
    payment_type_enum.create(op.get_bind(), checkfirst=True)
    op.add_column('clients', sa.Column('payment_type', payment_type_enum, nullable=True))


def downgrade() -> None:
    op.drop_column('clients', 'payment_type')
    sa.Enum(name='clientpaymenttype').drop(op.get_bind(), checkfirst=True)
