import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_admin
from database import get_db
from models import Course, Prerequisite, Program

router = APIRouter(prefix="/admin", tags=["admin"])

# --- Programs ---


class ProgramCreate(BaseModel):
    name: str


class ProgramUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


@router.get("/programs")
async def list_programs(db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    result = await db.execute(select(Program).order_by(Program.name))
    return result.scalars().all()


@router.get("/programs/{program_id}")
async def get_program(program_id: uuid.UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    result = await db.execute(select(Program).where(Program.id == program_id))
    program = result.scalar_one_or_none()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    return program


@router.post("/programs", status_code=status.HTTP_201_CREATED)
async def create_program(body: ProgramCreate, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    program = Program(name=body.name)
    db.add(program)
    await db.commit()
    await db.refresh(program)
    return program


@router.patch("/programs/{program_id}")
async def update_program(
    program_id: uuid.UUID, body: ProgramUpdate, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)
):
    result = await db.execute(select(Program).where(Program.id == program_id))
    program = result.scalar_one_or_none()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    if body.name is not None:
        program.name = body.name
    if body.is_active is not None:
        program.is_active = body.is_active
    await db.commit()
    await db.refresh(program)
    return program


@router.delete("/programs/{program_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_program(program_id: uuid.UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    result = await db.execute(delete(Program).where(Program.id == program_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Program not found")
    await db.commit()


# --- Courses ---


class CourseCreate(BaseModel):
    code: str
    name: str
    credits: int
    semester: int
    description: str | None = None
    program_id: uuid.UUID


class CourseUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    credits: int | None = None
    semester: int | None = None
    description: str | None = None


@router.get("/courses")
async def list_courses(
    program_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    result = await db.execute(
        select(Course).where(Course.program_id == program_id).order_by(Course.semester, Course.code)
    )
    return result.scalars().all()


@router.post("/courses", status_code=status.HTTP_201_CREATED)
async def create_course(body: CourseCreate, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    course = Course(**body.model_dump())
    db.add(course)
    await db.commit()
    await db.refresh(course)
    return course


@router.patch("/courses/{course_id}")
async def update_course(
    course_id: uuid.UUID, body: CourseUpdate, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)
):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(course, field, value)
    await db.commit()
    await db.refresh(course)
    return course


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    result = await db.execute(delete(Course).where(Course.id == course_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Course not found")
    await db.commit()


# --- Prerequisites ---


class PrerequisiteCreate(BaseModel):
    course_id: uuid.UUID
    prerequisite_course_id: uuid.UUID


@router.get("/prerequisites")
async def list_prerequisites(
    course_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    result = await db.execute(select(Prerequisite).where(Prerequisite.course_id == course_id))
    return result.scalars().all()


@router.post("/prerequisites", status_code=status.HTTP_201_CREATED)
async def create_prerequisite(
    body: PrerequisiteCreate, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)
):
    prereq = Prerequisite(**body.model_dump())
    db.add(prereq)
    await db.commit()
    await db.refresh(prereq)
    return prereq


@router.delete("/prerequisites/{prereq_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prerequisite(
    prereq_id: uuid.UUID, db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)
):
    result = await db.execute(select(Prerequisite).where(Prerequisite.id == prereq_id))
    prereq = result.scalar_one_or_none()
    if not prereq:
        raise HTTPException(status_code=404, detail="Prerequisite not found")
    await db.delete(prereq)
    await db.commit()
