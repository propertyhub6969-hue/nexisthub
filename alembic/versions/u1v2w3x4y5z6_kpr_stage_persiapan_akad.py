"""KPR: tambah tahap 'Persiapan Akad' (antara SP3K & Akad Kredit)

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
Create Date: 2026-08-04 04:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'u1v2w3x4y5z6'
down_revision: Union[str, None] = 't0u1v2w3x4y5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nilai enum baru diposisikan tepat SETELAH 'SP3K' (uppercase = konvensi .name SQLAlchemy).
    op.execute("ALTER TYPE kprstage ADD VALUE IF NOT EXISTS 'PERSIAPAN_AKAD' AFTER 'SP3K'")


def downgrade() -> None:
    # Postgres tak bisa hapus 1 nilai enum tanpa rebuild tipe — dibiarkan ada (aman, tak dipakai bila tak dipilih).
    pass
