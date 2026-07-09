"""kolom skala bisnis tenant (jumlah proyek + unit per proyek) diisi wajib saat register

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-07-09 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('estimated_project_count', sa.Integer(), nullable=True))
    op.add_column('tenants', sa.Column('estimated_units_per_project', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('tenants', 'estimated_units_per_project')
    op.drop_column('tenants', 'estimated_project_count')
