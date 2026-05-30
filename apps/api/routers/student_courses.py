import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Course, CourseStatus, Prerequisite, StudentCourse, StudentProgram, Program

router = APIRouter(prefix="/student-courses", tags=["student-courses"])


class StatusUpdate(BaseModel):
    status: CourseStatus


class BulkStatusItem(BaseModel):
    course_id: uuid.UUID
    status: CourseStatus


class BulkStatusUpdate(BaseModel):
    updates: list[BulkStatusItem]


@router.get("/my-program")
async def get_my_program(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict:
    result = await db.execute(
        select(Program)
        .join(StudentProgram, StudentProgram.program_id == Program.id)
        .where(StudentProgram.student_id == user["id"])
    )
    programs = result.scalars().all()
    return {
        "programs": [
            {"id": str(p.id), "name": p.name, "is_active": p.is_active}
            for p in programs
        ]
    }


@router.get("/summary")
async def get_summary(
    program_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    # All courses in the program
    courses_result = await db.execute(
        select(Course).where(Course.program_id == program_id)
    )
    courses = courses_result.scalars().all()
    course_ids = [c.id for c in courses]
    courses_by_id = {c.id: c for c in courses}

    total_credits = sum(c.credits for c in courses)

    # Student statuses for this program
    sc_result = await db.execute(
        select(StudentCourse).where(
            StudentCourse.student_id == user["id"],
            StudentCourse.course_id.in_(course_ids),
        )
    )
    student_courses = sc_result.scalars().all()
    status_by_course: dict[uuid.UUID, CourseStatus] = {sc.course_id: sc.status for sc in student_courses}

    approved_credits = sum(
        courses_by_id[cid].credits
        for cid, st in status_by_course.items()
        if st == CourseStatus.approved
    )
    in_progress_credits = sum(
        courses_by_id[cid].credits
        for cid, st in status_by_course.items()
        if st == CourseStatus.in_progress
    )
    approved_count = sum(1 for st in status_by_course.values() if st == CourseStatus.approved)

    in_progress_courses = [
        {"id": str(cid), "name": courses_by_id[cid].name, "code": courses_by_id[cid].code,
         "credits": courses_by_id[cid].credits, "semester": courses_by_id[cid].semester}
        for cid, st in status_by_course.items()
        if st == CourseStatus.in_progress
    ]

    # Prerequisite map: course_id -> set of prerequisite course_ids
    prereqs_result = await db.execute(
        select(Prerequisite).where(Prerequisite.course_id.in_(course_ids))
    )
    prereqs_by_course: dict[uuid.UUID, set[uuid.UUID]] = {}
    for p in prereqs_result.scalars().all():
        prereqs_by_course.setdefault(p.course_id, set()).add(p.prerequisite_course_id)

    approved_set = {cid for cid, st in status_by_course.items() if st == CourseStatus.approved}

    # A pending course is "available" when all its prereqs are approved
    pending_courses = [
        c for c in courses
        if status_by_course.get(c.id, CourseStatus.pending) == CourseStatus.pending
    ]
    next_available = [
        {"id": str(c.id), "name": c.name, "code": c.code, "credits": c.credits, "semester": c.semester}
        for c in pending_courses
        if prereqs_by_course.get(c.id, set()).issubset(approved_set)
    ]
    # Sort by semester so most immediate ones come first
    next_available.sort(key=lambda x: x["semester"])

    return {
        "total_credits": total_credits,
        "approved_credits": approved_credits,
        "in_progress_credits": in_progress_credits,
        "approved_count": approved_count,
        "in_progress_courses": in_progress_courses,
        "next_available_courses": next_available[:5],
    }


@router.patch("/bulk")
async def bulk_update_status(
    body: BulkStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Actualiza el estado de múltiples materias sin validar prerequisitos.
    Acción explícita del usuario — él es responsable de la coherencia."""
    succeeded: list[str] = []
    failed: list[dict] = []

    for item in body.updates:
        try:
            sc_result = await db.execute(
                select(StudentCourse).where(
                    StudentCourse.student_id == user["id"],
                    StudentCourse.course_id == item.course_id,
                )
            )
            sc_row = sc_result.scalar_one_or_none()
            if sc_row:
                sc_row.status = item.status
            else:
                sc_row = StudentCourse(
                    student_id=user["id"],
                    course_id=item.course_id,
                    status=item.status,
                )
                db.add(sc_row)
            succeeded.append(str(item.course_id))
        except Exception as e:
            failed.append({"course_id": str(item.course_id), "reason": str(e)})

    await db.commit()
    return {"succeeded": succeeded, "failed": failed}


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
