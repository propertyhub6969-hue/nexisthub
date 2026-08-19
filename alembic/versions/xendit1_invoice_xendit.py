"""invoice xendit fields

Revision ID: xendit1
Revises: opex1
Create Date: 2026-08-16
"""
from alembic import op
import sqlalchemy as sa

revision = "xendit1"
down_revision = "opex1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("xendit_invoice_id", sa.String(64), nullable=True))
    op.add_column("invoices", sa.Column("payment_url", sa.String(500), nullable=True))
    op.create_index("ix_invoices_xendit_invoice_id", "invoices", ["xendit_invoice_id"])


def downgrade() -> None:
    op.drop_index("ix_invoices_xendit_invoice_id", "invoices")
    op.drop_column("invoices", "payment_url")
    op.drop_column("invoices", "xendit_invoice_id")
