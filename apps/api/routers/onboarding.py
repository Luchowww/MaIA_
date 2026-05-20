"""
Student onboarding: lets a new student select their program and mark previously
approved courses, initializing their StudentCourse records.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_db_user
from database import get_db
from models import Course, StudentCourse, StudentProgram, CourseStatus, User

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


class OnboardingSubmit(BaseModel):
    program_id: uuid.UUID
    approved_course_ids: list[uuid.UUID]


@router.get("/status")
async def onboarding_status(user: User = Depends(get_db_user)):
    return {"is_onboarded": user.is_onboarded, "role": user.role}


@router.post("/submit")
async def submit_onboarding(
    body: OnboardingSubmit,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_db_user),
):
    if user.is_onboarded:
        raise HTTPException(status_code=400, detail="Onboarding already completed")

    # Validate all submitted course IDs belong to the program
    if body.approved_course_ids:
        courses_result = await db.execute(
            select(Course).where(
                Course.id.in_(body.approved_course_ids),
                Course.program_id == body.program_id,
            )
        )
        valid_courses = courses_result.scalars().all()
        valid_ids = {c.id for c in valid_courses}
    else:
        valid_ids = set()

    # Bulk upsert StudentCourse records with status=approved
    for course_id in valid_ids:
        existing = await db.execute(
            select(StudentCourse).where(
                StudentCourse.student_id == user.id,
                StudentCourse.course_id == course_id,
            )
        )
        sc = existing.scalar_one_or_none()
        if sc is None:
            db.add(StudentCourse(
                student_id=user.id,
                course_id=course_id,
                status=CourseStatus.approved,
            ))
        else:
            sc.status = CourseStatus.approved

    # Enroll student in the program (for dual-program support)
    existing_sp = await db.execute(
        select(StudentProgram).where(
            StudentProgram.student_id == user.id,
            StudentProgram.program_id == body.program_id,
        )
    )
    if existing_sp.scalar_one_or_none() is None:
        db.add(StudentProgram(student_id=user.id, program_id=body.program_id))

    # Mark user as onboarded
    user.is_onboarded = True
    await db.commit()

    return {
        "is_onboarded": True,
        "approved_courses": len(valid_ids),
        "program_id": str(body.program_id),
    }
