"""rekonsiliasi kas: is_cleared + cash_reconciliations

Revision ID: cashacct2
Revises: cashacct1
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "cashacct2"
down_revision = "cashacct1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("cash_book_entries", sa.Column("is_cleared", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("cash_transfers", sa.Column("is_cleared", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "cash_reconciliations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("cash_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("statement_date", sa.Date(), nullable=False),
        sa.Column("statement_balance", sa.Numeric(15, 2), nullable=False),
        sa.Column("book_balance", sa.Numeric(15, 2), nullable=False),
        sa.Column("cleared_balance", sa.Numeric(15, 2), nullable=False),
        sa.Column("difference", sa.Numeric(15, 2), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_cash_reconciliations_account", "cash_reconciliations", ["account_id"])


def downgrade():
    op.drop_index("ix_cash_reconciliations_account", "cash_reconciliations")
    op.drop_table("cash_reconciliations")
    op.drop_column("cash_transfers", "is_cleared")
    op.drop_column("cash_book_entries", "is_cleared")
