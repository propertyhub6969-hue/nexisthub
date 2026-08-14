"""tenant idle_timeout_minutes

Revision ID: tenantidle1
Revises: cashacct3
Create Date: 2026-08-14
"""
from alembic import op
import sqlalchemy as sa

revision = "tenantidle1"
down_revision = "cashacct3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("idle_timeout_minutes", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "idle_timeout_minutes")
