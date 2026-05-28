"""merge heads

Revision ID: d4e5f6a7b8c9
Revises: b2c3d4e5f6a7, c3d4e5f6a7b8
Create Date: 2026-05-20 14:00:00.000000

"""
from typing import Sequence, Union

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, tuple] = ('b2c3d4e5f6a7', 'c3d4e5f6a7b8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
