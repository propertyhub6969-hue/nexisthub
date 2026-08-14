"""document_texts: bank_id (template per bank)

Revision ID: doctext2
Revises: doctext1
Create Date: 2026-08-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "doctext2"
down_revision = "doctext1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("document_texts", sa.Column("bank_id", UUID(as_uuid=True),
                  sa.ForeignKey("banks.id", ondelete="CASCADE"), nullable=True))
    op.create_index("ix_document_texts_bank_id", "document_texts", ["bank_id"])
    # keunikan lama (tenant, doc_key) diganti index parsial: 1 default (bank NULL) + 1 per bank
    op.drop_constraint("uq_document_text_tenant_key", "document_texts", type_="unique")
    op.create_index("uq_doctext_default", "document_texts", ["tenant_id", "doc_key"],
                    unique=True, postgresql_where=sa.text("bank_id IS NULL"))
    op.create_index("uq_doctext_bank", "document_texts", ["tenant_id", "doc_key", "bank_id"],
                    unique=True, postgresql_where=sa.text("bank_id IS NOT NULL"))


def downgrade() -> None:
    op.drop_index("uq_doctext_bank", "document_texts")
    op.drop_index("uq_doctext_default", "document_texts")
    op.create_unique_constraint("uq_document_text_tenant_key", "document_texts", ["tenant_id", "doc_key"])
    op.drop_index("ix_document_texts_bank_id", "document_texts")
    op.drop_column("document_texts", "bank_id")
