"""add tax_records id_billing_file_* (bukti ID Billing, khusus dipakai PPh)

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-07-05 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, None] = 'd6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tax_records', sa.Column('id_billing_file_name', sa.String(length=255), nullable=True))
    op.add_column('tax_records', sa.Column('id_billing_file_type', sa.String(length=100), nullable=True))
    op.add_column('tax_records', sa.Column('id_billing_file_size', sa.Integer(), nullable=True))
    op.add_column('tax_records', sa.Column('id_billing_file_data', sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column('tax_records', 'id_billing_file_data')
    op.drop_column('tax_records', 'id_billing_file_size')
    op.drop_column('tax_records', 'id_billing_file_type')
    op.drop_column('tax_records', 'id_billing_file_name')
