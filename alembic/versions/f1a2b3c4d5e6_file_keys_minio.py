"""kolom file_key untuk penyimpanan file di MinIO (dokumen/pajak/pembayaran/PPJB-AJB/siteplan)

Revision ID: f1a2b3c4d5e6
Revises: b1c2d3e4f5a6
Create Date: 2026-07-07 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLS = [
    ('documents', 'file_key'),
    ('payments', 'file_key'),
    ('clients', 'ppjb_file_key'),
    ('clients', 'ajb_file_key'),
    ('tax_records', 'file_key'),
    ('tax_records', 'id_billing_file_key'),
    ('tax_records', 'validation_file_key'),
    ('projects', 'siteplan_key'),
]


def upgrade() -> None:
    for table, col in _COLS:
        op.add_column(table, sa.Column(col, sa.String(length=600), nullable=True))


def downgrade() -> None:
    for table, col in reversed(_COLS):
        op.drop_column(table, col)
