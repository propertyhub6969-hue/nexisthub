"""import batch tables (undo impor level 1)

Revision ID: importbatch1
Revises: notarypaid1
Create Date: 2026-08-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "importbatch1"
down_revision = "notarypaid1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "import_batches",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("entity", sa.String(20), nullable=False),
        sa.Column("inserted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("undone_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("undone_by_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_import_batches_tenant_id", "import_batches", ["tenant_id"])

    op.create_table(
        "import_batch_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("batch_id", UUID(as_uuid=True), sa.ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resource", sa.String(20), nullable=False),
        sa.Column("resource_id", UUID(as_uuid=True), nullable=False),
        sa.Column("file_key", sa.String(600), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_import_batch_items_batch_id", "import_batch_items", ["batch_id"])


def downgrade():
    op.drop_index("ix_import_batch_items_batch_id", "import_batch_items")
    op.drop_table("import_batch_items")
    op.drop_index("ix_import_batches_tenant_id", "import_batches")
    op.drop_table("import_batches")
