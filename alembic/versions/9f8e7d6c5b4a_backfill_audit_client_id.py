"""backfill audit_logs.client_id utk baris audit lama (sebelum fitur riwayat per pembeli)

Revision ID: 9f8e7d6c5b4a
Revises: d1a2b3c4e5f6
Create Date: 2026-07-04 21:40:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '9f8e7d6c5b4a'
down_revision: Union[str, None] = 'd1a2b3c4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_UUID_RE = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"


def upgrade() -> None:
    # 1) audit resource=clients → client_id = resource_id (id pembeli itu sendiri)
    op.execute(f"""
        UPDATE audit_logs SET client_id = resource_id::uuid
        WHERE resource = 'clients' AND client_id IS NULL
          AND resource_id ~ '{_UUID_RE}'
    """)
    # 2) audit resource=payments → client_id dari payments (termasuk yang soft-deleted)
    op.execute(f"""
        UPDATE audit_logs a SET client_id = p.client_id
        FROM payments p
        WHERE a.resource = 'payments' AND a.client_id IS NULL
          AND a.resource_id ~ '{_UUID_RE}' AND a.resource_id::uuid = p.id
          AND p.client_id IS NOT NULL
    """)
    # 3) audit resource=payment_schedules → client_id dari payment_schedules
    op.execute(f"""
        UPDATE audit_logs a SET client_id = s.client_id
        FROM payment_schedules s
        WHERE a.resource = 'payment_schedules' AND a.client_id IS NULL
          AND a.resource_id ~ '{_UUID_RE}' AND a.resource_id::uuid = s.id
          AND s.client_id IS NOT NULL
    """)


def downgrade() -> None:
    # backfill data-only; tak perlu di-rollback
    pass
