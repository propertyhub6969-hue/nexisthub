"""cash_account_id di payment/expense/notary_fee (pilih rekening di sumber)

Revision ID: cashacct3
Revises: cashacct2
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "cashacct3"
down_revision = "cashacct2"
branch_labels = None
depends_on = None


def upgrade():
    for tbl in ("payments", "expenses", "notary_fees"):
        op.add_column(tbl, sa.Column("cash_account_id", UUID(as_uuid=True),
                      sa.ForeignKey("cash_accounts.id", ondelete="SET NULL"), nullable=True))


def downgrade():
    for tbl in ("payments", "expenses", "notary_fees"):
        op.drop_column(tbl, "cash_account_id")
