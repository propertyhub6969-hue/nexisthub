"""backfill: expense opname borongan (contract_id) KONTRAKTOR -> UPAH

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-07-05 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # label enum = NAMA member (uppercase)
    op.execute("UPDATE expenses SET category='UPAH' WHERE contract_id IS NOT NULL AND category='KONTRAKTOR'")


def downgrade() -> None:
    op.execute("UPDATE expenses SET category='KONTRAKTOR' WHERE contract_id IS NOT NULL AND category='UPAH'")
