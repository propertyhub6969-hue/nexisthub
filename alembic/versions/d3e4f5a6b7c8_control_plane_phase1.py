"""control plane fase 1: users.is_platform_admin, tenants.feature_flags + expires_at

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-07-07 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_platform_admin', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('tenants', sa.Column('expires_at', sa.Date(), nullable=True))
    op.add_column('tenants', sa.Column('feature_flags', JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('tenants', 'feature_flags')
    op.drop_column('tenants', 'expires_at')
    op.drop_column('users', 'is_platform_admin')
