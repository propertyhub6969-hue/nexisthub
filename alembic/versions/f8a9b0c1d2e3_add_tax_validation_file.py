"""add tax_records validation_file_* (bukti validasi pajak, dipakai PPh)

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-07-05 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8a9b0c1d2e3'
down_revision: Union[str, None] = 'e7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tax_records', sa.Column('validation_file_name', sa.String(length=255), nullable=True))
    op.add_column('tax_records', sa.Column('validation_file_type', sa.String(length=100), nullable=True))
    op.add_column('tax_records', sa.Column('validation_file_size', sa.Integer(), nullable=True))
    op.add_column('tax_records', sa.Column('validation_file_data', sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column('tax_records', 'validation_file_data')
    op.drop_column('tax_records', 'validation_file_size')
    op.drop_column('tax_records', 'validation_file_type')
    op.drop_column('tax_records', 'validation_file_name')
