"""add users roles onboarding

Revision ID: c3d4e5f6a7b8
Revises: 6d71228b7828
Create Date: 2026-05-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = '6d71228b7828'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR NOT NULL PRIMARY KEY,
            email VARCHAR(255),
            role VARCHAR(20) NOT NULL DEFAULT 'student',
            is_onboarded BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_email")
    op.drop_table('users')
