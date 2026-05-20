import uuid
from collections import deque

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Course, CourseStatus, Prerequisite, StudentCourse

router = APIRouter(prefix="/simulation", tags=["simulation"])


class SimulationRequest(BaseModel):
    course_id: uuid.UUID
    program_id: uuid.UUID


@router.post("/loss")
async def simulate_loss(
    body: SimulationRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    # Build adjacency: course_id → list of courses that depend on it
    prereqs_result = await db.execute(
        select(Prerequisite).join(Course, Prerequisite.course_id == Course.id).where(
            Course.program_id == body.program_id
        )
    )
    dependents_map: dict[uuid.UUID, list[uuid.UUID]] = {}
    for p in prereqs_result.scalars().all():
        dependents_map.setdefault(p.prerequisite_course_id, []).append(p.course_id)

    # BFS to find all transitively affected courses
    affected: list[uuid.UUID] = []
    queue = deque([body.course_id])
    visited = {body.course_id}
    while queue:
        current = queue.popleft()
        affected.append(current)
        for dep in dependents_map.get(current, []):
            if dep not in visited:
                visited.add(dep)
                queue.append(dep)

    # Upsert all affected courses to "simulated" status
    for course_id in affected:
        sc_result = await db.execute(
            select(StudentCourse).where(
                StudentCourse.student_id == user["id"],
                StudentCourse.course_id == course_id,
            )
        )
        sc_row = sc_result.scalar_one_or_none()
        if sc_row:
            sc_row.status = CourseStatus.simulated
        else:
            db.add(StudentCourse(
                student_id=user["id"],
                course_id=course_id,
                status=CourseStatus.simulated,
            ))

    await db.commit()
    return {"affected_course_ids": [str(cid) for cid in affected]}
