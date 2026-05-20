import uuid
from collections import deque

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Course, Prerequisite, SimulationScenario

router = APIRouter(prefix="/simulation", tags=["simulation"])


class SimulationRequest(BaseModel):
    course_id: uuid.UUID
    program_id: uuid.UUID


class SaveScenarioRequest(BaseModel):
    course_id: uuid.UUID
    program_id: uuid.UUID
    name: str


async def _run_bfs(
    db: AsyncSession,
    program_id: uuid.UUID,
    start_course_id: uuid.UUID,
) -> tuple[list[uuid.UUID], int, dict[uuid.UUID, Course]]:
    """BFS transitivo desde start_course_id. Retorna (affected_ids, estimated_semesters, courses_by_id)."""
    prereqs_result = await db.execute(
        select(Prerequisite).join(Course, Prerequisite.course_id == Course.id).where(
            Course.program_id == program_id
        )
    )
    dependents_map: dict[uuid.UUID, list[uuid.UUID]] = {}
    for p in prereqs_result.scalars().all():
        dependents_map.setdefault(p.prerequisite_course_id, []).append(p.course_id)

    affected: list[uuid.UUID] = []
    queue = deque([start_course_id])
    visited = {start_course_id}
    while queue:
        current = queue.popleft()
        affected.append(current)
        for dep in dependents_map.get(current, []):
            if dep not in visited:
                visited.add(dep)
                queue.append(dep)

    courses_result = await db.execute(select(Course).where(Course.id.in_(affected)))
    courses_by_id = {c.id: c for c in courses_result.scalars().all()}

    start_sem = courses_by_id[start_course_id].semester if start_course_id in courses_by_id else 0
    max_sem = max(
        (courses_by_id[cid].semester for cid in affected if cid in courses_by_id),
        default=start_sem,
    )
    estimated_semesters = max_sem - start_sem

    return affected, estimated_semesters, courses_by_id


@router.post("/loss")
async def simulate_loss(
    body: SimulationRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Simula la pérdida de una materia. Solo lectura — no modifica student_courses."""
    affected, estimated_semesters, _ = await _run_bfs(db, body.program_id, body.course_id)
    return {
        "affected_course_ids": [str(cid) for cid in affected],
        "estimated_semesters": estimated_semesters,
    }


@router.post("/scenarios", status_code=201)
async def save_scenario(
    body: SaveScenarioRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Guarda un escenario de simulación con nombre para consulta futura."""
    affected, estimated_semesters, courses_by_id = await _run_bfs(db, body.program_id, body.course_id)

    snapshot = {
        str(cid): courses_by_id[cid].semester
        for cid in affected
        if cid in courses_by_id
    }

    scenario = SimulationScenario(
        student_id=user["id"],
        program_id=body.program_id,
        name=body.name,
        triggered_course_id=body.course_id,
        course_snapshot=snapshot,
        affected_count=len(affected),
        estimated_semesters=estimated_semesters,
    )
    db.add(scenario)
    await db.commit()
    await db.refresh(scenario)

    return _serialize_scenario(scenario)


@router.get("/scenarios/compare")
async def compare_scenarios(
    ids: str = Query(..., description="IDs de escenarios separados por coma"),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Compara múltiples escenarios y determina cuál minimiza el tiempo de graduación."""
    id_list = [uuid.UUID(i.strip()) for i in ids.split(",") if i.strip()]
    if len(id_list) < 2:
        raise HTTPException(status_code=400, detail="Se requieren al menos 2 escenarios para comparar")

    result = await db.execute(
        select(SimulationScenario).where(
            SimulationScenario.id.in_(id_list),
            SimulationScenario.student_id == user["id"],
        )
    )
    scenarios = result.scalars().all()

    if len(scenarios) != len(id_list):
        raise HTTPException(status_code=404, detail="Uno o más escenarios no encontrados")

    all_course_ids = set()
    for s in scenarios:
        all_course_ids.update(s.course_snapshot.keys())

    courses_result = await db.execute(
        select(Course).where(Course.id.in_([uuid.UUID(cid) for cid in all_course_ids]))
    )
    courses = {str(c.id): c for c in courses_result.scalars().all()}

    scenario_data = []
    for s in scenarios:
        scenario_data.append({
            **_serialize_scenario(s),
            "affected_courses": [
                {
                    "course_id": cid,
                    "semester": sem,
                    "name": courses[cid].name if cid in courses else "Desconocido",
                    "code": courses[cid].code if cid in courses else "",
                }
                for cid, sem in s.course_snapshot.items()
            ],
        })

    best = min(scenarios, key=lambda s: s.estimated_semesters)

    return {
        "scenarios": scenario_data,
        "best_scenario_id": str(best.id),
        "best_scenario_name": best.name,
    }


@router.get("/scenarios/{scenario_id}")
async def get_scenario(
    scenario_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    scenario = await _get_owned_scenario(db, scenario_id, user["id"])
    return _serialize_scenario(scenario)


@router.delete("/scenarios/{scenario_id}", status_code=204)
async def delete_scenario(
    scenario_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    scenario = await _get_owned_scenario(db, scenario_id, user["id"])
    await db.delete(scenario)
    await db.commit()


@router.get("/scenarios")
async def list_scenarios(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(SimulationScenario)
        .where(SimulationScenario.student_id == user["id"])
        .order_by(SimulationScenario.created_at.desc())
    )
    return [_serialize_scenario(s) for s in result.scalars().all()]


# ── helpers ──────────────────────────────────────────────────────────────────

async def _get_owned_scenario(
    db: AsyncSession, scenario_id: uuid.UUID, student_id: str
) -> SimulationScenario:
    result = await db.execute(
        select(SimulationScenario).where(
            SimulationScenario.id == scenario_id,
            SimulationScenario.student_id == student_id,
        )
    )
    scenario = result.scalar_one_or_none()
    if not scenario:
        raise HTTPException(status_code=404, detail="Escenario no encontrado")
    return scenario


def _serialize_scenario(s: SimulationScenario) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "program_id": str(s.program_id),
        "triggered_course_id": str(s.triggered_course_id),
        "course_snapshot": s.course_snapshot,
        "affected_count": s.affected_count,
        "estimated_semesters": s.estimated_semesters,
        "created_at": s.created_at.isoformat(),
    }
