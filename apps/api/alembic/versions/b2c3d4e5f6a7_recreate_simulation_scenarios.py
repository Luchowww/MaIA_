"""recreate simulation_scenarios

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-20 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('DROP TABLE IF EXISTS simulation_scenario_courses CASCADE')
    op.execute('DROP TABLE IF EXISTS simulation_scenarios CASCADE')
    op.create_table(
        'simulation_scenarios',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('student_id', sa.String(), nullable=False),
        sa.Column('program_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('triggered_course_id', sa.UUID(), nullable=False),
        sa.Column('course_snapshot', JSON(), nullable=False),
        sa.Column('affected_count', sa.Integer(), nullable=False),
        sa.Column('estimated_semesters', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['program_id'], ['programs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['triggered_course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_simulation_scenarios_student_id', 'simulation_scenarios', ['student_id'])


def downgrade() -> None:
    op.drop_index('ix_simulation_scenarios_student_id', table_name='simulation_scenarios')
    op.drop_table('simulation_scenarios')
