"""add payment.kpr_id (pencairan KPR) + backfill pencairan lama

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-04 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('payments', sa.Column('kpr_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_payments_kpr_id'), 'payments', ['kpr_id'], unique=False)
    op.create_foreign_key(None, 'payments', 'kpr_applications', ['kpr_id'], ['id'], ondelete='SET NULL')
    # Backfill: pencairan yang sudah ada (KprApplication.pencairan_payment_id) ditandai kpr_id.
    op.execute(
        "UPDATE payments SET kpr_id = k.id "
        "FROM kpr_applications k WHERE k.pencairan_payment_id = payments.id"
    )


def downgrade() -> None:
    op.drop_constraint(None, 'payments', type_='foreignkey')
    op.drop_index(op.f('ix_payments_kpr_id'), table_name='payments')
    op.drop_column('payments', 'kpr_id')
