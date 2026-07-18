"""logo perusahaan per tenant — dipakai di kop dokumen cetak

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-07-18 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6g7h8i9j0k1'
down_revision: Union[str, None] = 'e5f6g7h8i9j0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('logo_key', sa.String(length=600), nullable=True))
    op.add_column('tenants', sa.Column('logo_name', sa.String(length=255), nullable=True))
    op.add_column('tenants', sa.Column('logo_type', sa.String(length=100), nullable=True))
    op.add_column('tenants', sa.Column('logo_size', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('tenants', 'logo_size')
    op.drop_column('tenants', 'logo_type')
    op.drop_column('tenants', 'logo_name')
    op.drop_column('tenants', 'logo_key')
