"""isi mundur: prospek utk booking yang sudah DITERIMA sebelum fitur prospek-otomatis ada

Revision ID: y5z6a7b8c9d0
Revises: x4y5z6a7b8c9
Create Date: 2026-08-06 08:00:00.000000

Booking yang diterima SEBELUM prospek-otomatis dirilis membuat unit tertahan (Booking/DP)
tetapi calonnya tak tercatat di CRM sama sekali — tak muncul di Pembeli maupun Prospek.
Migrasi ini membuatkan Prospek-nya (idempoten: hanya yang prospect_id-nya masih kosong).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'y5z6a7b8c9d0'
down_revision: Union[str, None] = 'x4y5z6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text("""
        SELECT b.id, b.tenant_id, b.agent_name, b.agent_phone, b.prospect_name, b.prospect_phone,
               b.notes, u.project_id, u.unit_type, u.price,
               COALESCE(NULLIF(CONCAT_WS('-', u.block, u.unit_number), ''), '?') AS unit_label
        FROM unit_booking_requests b
        JOIN units u ON u.id = b.unit_id
        WHERE b.status = 'ACCEPTED' AND b.prospect_id IS NULL
          AND (b.prospect_name IS NOT NULL OR b.prospect_phone IS NOT NULL)
    """)).fetchall()

    for r in rows:
        catatan = [f"Dari booking agen {r.agent_name}" + (f" ({r.agent_phone})" if r.agent_phone else "")]
        catatan.append(f"Unit diminati: {r.unit_label}")
        if r.notes:
            catatan.append(f"Catatan agen: {r.notes}")
        pid = conn.execute(sa.text("""
            INSERT INTO prospects (id, created_at, updated_at, tenant_id, full_name, phone,
                                   interested_project_id, unit_type, budget, status, notes)
            VALUES (gen_random_uuid(), now(), now(), :tenant_id, :full_name, :phone,
                    :project_id, :unit_type, :budget, 'ACTIVE', :notes)
            RETURNING id
        """), {
            "tenant_id": r.tenant_id,
            "full_name": r.prospect_name or f"(via agen {r.agent_name})",
            "phone": r.prospect_phone,
            "project_id": r.project_id,
            "unit_type": r.unit_type,
            "budget": r.price,
            "notes": " · ".join(catatan),
        }).scalar()
        conn.execute(sa.text("UPDATE unit_booking_requests SET prospect_id = :p WHERE id = :b"),
                     {"p": pid, "b": r.id})


def downgrade() -> None:
    # Prospek hasil isi-mundur dibiarkan (data CRM nyata — menghapusnya justru merugikan);
    # hanya tautannya yang dilepas agar konsisten dgn skema lama.
    pass
