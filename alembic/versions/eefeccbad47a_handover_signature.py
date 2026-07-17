"""serah-terima: tambah kolom signature (ttd digital PIC penerima, data URL base64)

Revision ID: eefeccbad47a
Revises: 84c5c99cb136
Create Date: 2026-07-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'eefeccbad47a'
down_revision: Union[str, None] = '84c5c99cb136'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('document_handovers', sa.Column('signature', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('document_handovers', 'signature')
