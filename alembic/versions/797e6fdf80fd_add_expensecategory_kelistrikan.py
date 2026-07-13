"""tambah kategori biaya/RAB: KELISTRIKAN

Revision ID: 797e6fdf80fd
Revises: c725295102c8
Create Date: 2026-07-10 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '797e6fdf80fd'
down_revision: Union[str, None] = 'c725295102c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ADD VALUE tak boleh di transaksi biasa -> autocommit_block (pola sama spt MovementSource/POStatus).
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE expensecategory ADD VALUE IF NOT EXISTS 'KELISTRIKAN' AFTER 'KONTRAKTOR'")


def downgrade() -> None:
    pass  # Postgres tak mendukung DROP VALUE sederhana
