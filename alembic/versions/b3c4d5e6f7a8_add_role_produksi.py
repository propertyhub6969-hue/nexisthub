"""add role 'PRODUKSI' ke enum userrole

Revision ID: b3c4d5e6f7a8
Revises: f7e6d5c4b3a2
Create Date: 2026-07-05 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'f7e6d5c4b3a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Label enum = NAMA member (uppercase), sesuai default SQLAlchemy. ADD VALUE di luar transaksi.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'PRODUKSI'")


def downgrade() -> None:
    # Postgres tak mendukung DROP VALUE dari enum; biarkan (tak merusak).
    pass
