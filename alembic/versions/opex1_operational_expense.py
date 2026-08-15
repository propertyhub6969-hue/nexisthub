"""operational expenses + opex categories

Revision ID: opex1
Revises: doctext3
Create Date: 2026-08-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "opex1"
down_revision = "doctext3"
branch_labels = None
depends_on = None

_DEFAULTS = ["Gaji & Tunjangan", "Sewa Kantor", "Listrik & Air Kantor",
             "ATK & Perlengkapan", "Marketing & Promosi", "Transport & Perjalanan", "Lain-lain"]


def upgrade() -> None:
    op.create_table(
        "opex_categories",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_opex_categories_tenant_id", "opex_categories", ["tenant_id"])

    op.create_table(
        "operational_expenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("opex_category_id", UUID(as_uuid=True), sa.ForeignKey("opex_categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=True),
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("paid_at", sa.Date(), nullable=True),
        sa.Column("cash_account_id", UUID(as_uuid=True), sa.ForeignKey("cash_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_operational_expenses_tenant_id", "operational_expenses", ["tenant_id"])
    op.create_index("ix_operational_expenses_opex_category_id", "operational_expenses", ["opex_category_id"])

    # seed default sub-kategori utk tenant yang sudah ada
    for i, name in enumerate(_DEFAULTS):
        op.execute(sa.text(
            "INSERT INTO opex_categories (id, tenant_id, name, sort_order, is_active, is_deleted, created_at, updated_at) "
            "SELECT gen_random_uuid(), t.id, :name, :ord, true, false, now(), now() FROM tenants t"
        ).bindparams(name=name, ord=i))


def downgrade() -> None:
    op.drop_table("operational_expenses")
    op.drop_table("opex_categories")
