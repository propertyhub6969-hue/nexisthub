"""plan upgrade requests

Revision ID: planreq1
Revises: plans1
Create Date: 2026-08-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "planreq1"
down_revision = "plans1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_name", sa.String(200), nullable=True),
        sa.Column("plan_id", UUID(as_uuid=True), sa.ForeignKey("plans.id", ondelete="SET NULL"), nullable=True),
        sa.Column("plan_name", sa.String(80), nullable=True),
        sa.Column("current_plan", sa.String(80), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("requested_by_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_plan_requests_tenant_id", "plan_requests", ["tenant_id"])
    op.create_index("ix_plan_requests_status", "plan_requests", ["status"])


def downgrade() -> None:
    op.drop_table("plan_requests")
