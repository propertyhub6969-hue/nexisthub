"""document_texts: penandatangan (signer_name, signer_title)

Revision ID: doctext3
Revises: doctext2
Create Date: 2026-08-14
"""
from alembic import op
import sqlalchemy as sa

revision = "doctext3"
down_revision = "doctext2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("document_texts", sa.Column("signer_name", sa.String(200), nullable=True))
    op.add_column("document_texts", sa.Column("signer_title", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("document_texts", "signer_title")
    op.drop_column("document_texts", "signer_name")
