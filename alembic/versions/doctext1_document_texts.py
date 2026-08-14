"""document_texts (teks dokumen per-tenant)

Revision ID: doctext1
Revises: announce1
Create Date: 2026-08-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "doctext1"
down_revision = "announce1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_texts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("doc_key", sa.String(50), nullable=False),
        sa.Column("subject", sa.String(300), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "doc_key", name="uq_document_text_tenant_key"),
    )
    op.create_index("ix_document_texts_tenant_id", "document_texts", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("document_texts")
