"""add tax_records file columns + client ppjb/ajb number+file

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-04 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tax_records', sa.Column('file_name', sa.String(length=255), nullable=True))
    op.add_column('tax_records', sa.Column('file_type', sa.String(length=100), nullable=True))
    op.add_column('tax_records', sa.Column('file_size', sa.Integer(), nullable=True))
    op.add_column('tax_records', sa.Column('file_data', sa.LargeBinary(), nullable=True))

    op.add_column('clients', sa.Column('ppjb_number', sa.String(length=100), nullable=True))
    op.add_column('clients', sa.Column('ppjb_file_name', sa.String(length=255), nullable=True))
    op.add_column('clients', sa.Column('ppjb_file_type', sa.String(length=100), nullable=True))
    op.add_column('clients', sa.Column('ppjb_file_size', sa.Integer(), nullable=True))
    op.add_column('clients', sa.Column('ppjb_file_data', sa.LargeBinary(), nullable=True))
    op.add_column('clients', sa.Column('ajb_number', sa.String(length=100), nullable=True))
    op.add_column('clients', sa.Column('ajb_file_name', sa.String(length=255), nullable=True))
    op.add_column('clients', sa.Column('ajb_file_type', sa.String(length=100), nullable=True))
    op.add_column('clients', sa.Column('ajb_file_size', sa.Integer(), nullable=True))
    op.add_column('clients', sa.Column('ajb_file_data', sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column('clients', 'ajb_file_data')
    op.drop_column('clients', 'ajb_file_size')
    op.drop_column('clients', 'ajb_file_type')
    op.drop_column('clients', 'ajb_file_name')
    op.drop_column('clients', 'ajb_number')
    op.drop_column('clients', 'ppjb_file_data')
    op.drop_column('clients', 'ppjb_file_size')
    op.drop_column('clients', 'ppjb_file_type')
    op.drop_column('clients', 'ppjb_file_name')
    op.drop_column('clients', 'ppjb_number')

    op.drop_column('tax_records', 'file_data')
    op.drop_column('tax_records', 'file_size')
    op.drop_column('tax_records', 'file_type')
    op.drop_column('tax_records', 'file_name')
