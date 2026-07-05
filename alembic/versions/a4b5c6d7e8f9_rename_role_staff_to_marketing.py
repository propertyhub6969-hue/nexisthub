"""rename role STAFF -> MARKETING (enum userrole)

Revision ID: a4b5c6d7e8f9
Revises: b3c4d5e6f7a8
Create Date: 2026-07-05 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a4b5c6d7e8f9'
down_revision: Union[str, None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # RENAME VALUE aman di dalam transaksi (PG10+); user lama ber-role STAFF ikut jadi MARKETING.
    op.execute("ALTER TYPE userrole RENAME VALUE 'STAFF' TO 'MARKETING'")


def downgrade() -> None:
    op.execute("ALTER TYPE userrole RENAME VALUE 'MARKETING' TO 'STAFF'")
