import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import get_current_user
from database import get_db
from models import Course, Prerequisite, StudentCourse

router = APIRouter(prefix="/courses", tags=["courses"])

programs_router = APIRouter(prefix="/programs", tags=["programs"])


@programs_router.get("")
async def list_programs_public(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    from models import Program
    from sqlalchemy import select as sa_select
    result = await db.execute(sa_select(Program).where(Program.is_active == True).order_by(Program.name))
    return result.scalars().all()


@router.get("")
async def list_courses(
    program_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Course)
        .where(Course.program_id == program_id)
        .options(selectinload(Course.prerequisites))
        .order_by(Course.semester, Course.code)
    )
    return result.scalars().all()


@router.get("/graph")
async def get_graph(
    program_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    courses_result = await db.execute(
        select(Course).where(Course.program_id == program_id)
    )
    courses = courses_result.scalars().all()
    course_ids = [c.id for c in courses]

    prereqs_result = await db.execute(
        select(Prerequisite).where(Prerequisite.course_id.in_(course_ids))
    )
    prereqs = prereqs_result.scalars().all()

    student_courses_result = await db.execute(
        select(StudentCourse).where(
            StudentCourse.student_id == user["id"],
            StudentCourse.course_id.in_(course_ids),
        )
    )
    student_statuses = {sc.course_id: sc.status for sc in student_courses_result.scalars().all()}

    nodes = [
        {
            "id": str(c.id),
            "data": {
                "code": c.code,
                "name": c.name,
                "credits": c.credits,
                "semester": c.semester,
                "status": student_statuses.get(c.id, "pending"),
            },
            "position": {"x": c.semester * 200, "y": 0},
            "type": "courseNode",
        }
        for c in courses
    ]

    edges = [
        {
            "id": str(p.id),
            "source": str(p.prerequisite_course_id),
            "target": str(p.course_id),
        }
        for p in prereqs
    ]

    return {"nodes": nodes, "edges": edges}
