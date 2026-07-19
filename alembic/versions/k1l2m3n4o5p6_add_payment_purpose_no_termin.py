"""tambah jenis pembayaran tanpa termin: lunas_unit, cicilan, pelunasan

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-07-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'k1l2m3n4o5p6'
down_revision: Union[str, None] = 'j0k1l2m3n4o5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE paymentpurpose ADD VALUE IF NOT EXISTS 'LUNAS_UNIT'")
        op.execute("ALTER TYPE paymentpurpose ADD VALUE IF NOT EXISTS 'CICILAN'")
        op.execute("ALTER TYPE paymentpurpose ADD VALUE IF NOT EXISTS 'PELUNASAN'")


def downgrade() -> None:
    # Postgres tak mendukung DROP VALUE dari enum; biarkan (tak merusak).
    pass
