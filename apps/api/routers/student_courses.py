import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import CourseStatus, Prerequisite, StudentCourse

router = APIRouter(prefix="/student-courses", tags=["student-courses"])


class StatusUpdate(BaseModel):
    status: CourseStatus


@router.patch("/{course_id}")
async def update_status(
    course_id: uuid.UUID,
    body: StatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if body.status == CourseStatus.approved:
        prereqs = await db.execute(
            select(Prerequisite).where(Prerequisite.course_id == course_id)
        )
        for prereq in prereqs.scalars().all():
            sc = await db.execute(
                select(StudentCourse).where(
                    StudentCourse.student_id == user["id"],
                    StudentCourse.course_id == prereq.prerequisite_course_id,
                )
            )
            sc_row = sc.scalar_one_or_none()
            if not sc_row or sc_row.status != CourseStatus.approved:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Prerequisite not approved",
                )

    sc_result = await db.execute(
        select(StudentCourse).where(
            StudentCourse.student_id == user["id"],
            StudentCourse.course_id == course_id,
        )
    )
    sc_row = sc_result.scalar_one_or_none()

    if sc_row:
        sc_row.status = body.status
    else:
        sc_row = StudentCourse(
            student_id=user["id"],
            course_id=course_id,
            status=body.status,
        )
        db.add(sc_row)

    await db.commit()
    await db.refresh(sc_row)
    return sc_row
