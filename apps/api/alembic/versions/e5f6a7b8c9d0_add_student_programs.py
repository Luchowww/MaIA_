"""add student_programs table and enrolled_at column

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-20 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create table if it doesn't exist yet
    op.execute("""
        CREATE TABLE IF NOT EXISTS student_programs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id VARCHAR NOT NULL,
            program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
            enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (student_id, program_id)
        )
    """)
    # Add enrolled_at in case the table already exists without it
    op.execute("""
        ALTER TABLE student_programs
        ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    """)


def downgrade() -> None:
    op.drop_table('student_programs')
