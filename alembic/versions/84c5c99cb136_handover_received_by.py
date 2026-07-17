"""serah-terima: tambah kolom received_by (PIC penerima, mis. staf notaris yang ttd)

Revision ID: 84c5c99cb136
Revises: 2fa0f401f514
Create Date: 2026-07-17 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '84c5c99cb136'
down_revision: Union[str, None] = '2fa0f401f514'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('document_handovers', sa.Column('received_by', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('document_handovers', 'received_by')
