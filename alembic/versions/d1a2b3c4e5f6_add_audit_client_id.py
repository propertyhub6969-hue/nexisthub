"""add audit_logs.client_id (kelompokkan riwayat per pembeli lintas resource)

Revision ID: d1a2b3c4e5f6
Revises: d0e1f2a3b4c5
Create Date: 2026-07-04 21:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1a2b3c4e5f6'
down_revision: Union[str, None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('audit_logs', sa.Column('client_id', sa.UUID(), nullable=True))
    op.create_index('ix_audit_logs_client_id', 'audit_logs', ['client_id'])


def downgrade() -> None:
    op.drop_index('ix_audit_logs_client_id', table_name='audit_logs')
    op.drop_column('audit_logs', 'client_id')
