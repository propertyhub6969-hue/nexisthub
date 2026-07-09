"""retur material 2 arah: MovementSource RETURN_VENDOR + RETURN_UNIT

Revision ID: ba01633f14ae
Revises: a2b3c4d5e6f7
Create Date: 2026-07-09 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'ba01633f14ae'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ADD VALUE tak boleh di dalam transaksi biasa -> pakai autocommit_block (pola sama spt POStatus.PARTIAL).
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE movementsource ADD VALUE IF NOT EXISTS 'RETURN_VENDOR'")
        op.execute("ALTER TYPE movementsource ADD VALUE IF NOT EXISTS 'RETURN_UNIT'")


def downgrade() -> None:
    pass  # nilai enum dibiarkan (Postgres tak mendukung DROP VALUE sederhana)
