"""cash accounts + transfers + entry.account_id (kas/bank multi-rekening)

Revision ID: cashacct1
Revises: importbatch1
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "cashacct1"
down_revision = "importbatch1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "cash_accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False, server_default="BANK"),
        sa.Column("bank_name", sa.String(100), nullable=True),
        sa.Column("account_number", sa.String(50), nullable=True),
        sa.Column("opening_balance", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("opening_date", sa.Date(), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_cash_accounts_tenant_id", "cash_accounts", ["tenant_id"])

    op.create_table(
        "cash_transfers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_account_id", UUID(as_uuid=True), sa.ForeignKey("cash_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("to_account_id", UUID(as_uuid=True), sa.ForeignKey("cash_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_cash_transfers_tenant_id", "cash_transfers", ["tenant_id"])
    op.create_index("ix_cash_transfers_from", "cash_transfers", ["from_account_id"])
    op.create_index("ix_cash_transfers_to", "cash_transfers", ["to_account_id"])

    op.add_column("cash_book_entries", sa.Column("account_id", UUID(as_uuid=True),
                  sa.ForeignKey("cash_accounts.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_cash_book_entries_account_id", "cash_book_entries", ["account_id"])


def downgrade():
    op.drop_index("ix_cash_book_entries_account_id", "cash_book_entries")
    op.drop_column("cash_book_entries", "account_id")
    op.drop_index("ix_cash_transfers_to", "cash_transfers")
    op.drop_index("ix_cash_transfers_from", "cash_transfers")
    op.drop_index("ix_cash_transfers_tenant_id", "cash_transfers")
    op.drop_table("cash_transfers")
    op.drop_index("ix_cash_accounts_tenant_id", "cash_accounts")
    op.drop_table("cash_accounts")
