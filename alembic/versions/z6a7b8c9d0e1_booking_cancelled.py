"""booking: status CANCELLED (batal setelah diterima → unit dilepas)

Revision ID: z6a7b8c9d0e1
Revises: y5z6a7b8c9d0
Create Date: 2026-08-06 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'z6a7b8c9d0e1'
down_revision: Union[str, None] = 'y5z6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE bookingrequeststatus ADD VALUE IF NOT EXISTS 'CANCELLED'")


def downgrade() -> None:
    # Postgres tak bisa hapus 1 nilai enum tanpa rebuild tipe — dibiarkan (aman bila tak dipakai).
    pass
