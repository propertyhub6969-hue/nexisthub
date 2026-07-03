"""document: add unit_id + make client_id nullable (dokumen legalitas per unit)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-04 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('unit_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_documents_unit_id'), 'documents', ['unit_id'], unique=False)
    op.create_foreign_key(None, 'documents', 'units', ['unit_id'], ['id'], ondelete='CASCADE')
    op.alter_column('documents', 'client_id', existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    op.alter_column('documents', 'client_id', existing_type=sa.UUID(), nullable=False)
    op.drop_constraint(None, 'documents', type_='foreignkey')
    op.drop_index(op.f('ix_documents_unit_id'), table_name='documents')
    op.drop_column('documents', 'unit_id')
