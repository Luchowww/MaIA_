import uuid
from collections import deque

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Course, Prerequisite, SimulationScenario, StudentCourse

CREDIT_BASE = 17
CREDIT_MAX = 21
EXTRA_CREDIT_COST = 866_400

router = APIRouter(prefix="/simulation", tags=["simulation"])


class SimulationRequest(BaseModel):
    course_id: uuid.UUID
    program_id: uuid.UUID


class SaveScenarioRequest(BaseModel):
    course_id: uuid.UUID
    program_id: uuid.UUID
    name: str


class ValidateCourseAssignment(BaseModel):
    course_id: uuid.UUID
    assigned_semester: int


class ValidatePlanRequest(BaseModel):
    program_id: uuid.UUID
    plan: list[ValidateCourseAssignment]


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
    """Simula la pérdida de una materia. Solo lectura — no modifica student_courses.

    Retorna el atraso REAL (semestres extra vs el diseño del programa), no el
    span del árbol de dependencias.
    """
    affected, _, courses_by_id = await _run_bfs(db, body.program_id, body.course_id)

    max_sem_result = await db.execute(
        select(func.max(Course.semester)).where(Course.program_id == body.program_id)
    )
    max_original_sem = max_sem_result.scalar() or 0

    max_affected_sem = max(
        (courses_by_id[cid].semester for cid in affected if cid in courses_by_id),
        default=0,
    )
    # Atraso "Sin cambios": la cadena se desplaza 1 semestre; si el último afectado
    # estaba en el último semestre del programa, se requiere un semestre adicional.
    delay_semesters = max(0, max_affected_sem + 1 - max_original_sem)

    return {
        "affected_course_ids": [str(cid) for cid in affected],
        "delay_semesters": delay_semesters,
        "program_length": max_original_sem,
        # backward-compat alias para clientes existentes (mismo valor que delay_semesters)
        "estimated_semesters": delay_semesters,
    }


@router.post("/mitigate")
async def simulate_mitigation(
    body: SimulationRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Calcula escenarios de mitigación para la pérdida de una materia."""
    courses_result = await db.execute(
        select(Course).where(Course.program_id == body.program_id)
    )
    all_courses = {c.id: c for c in courses_result.scalars().all()}

    if body.course_id not in all_courses:
        raise HTTPException(status_code=404, detail="Materia no encontrada")

    prereqs_result = await db.execute(
        select(Prerequisite).where(Prerequisite.course_id.in_(all_courses.keys()))
    )
    prereqs_map: dict[uuid.UUID, set[uuid.UUID]] = {cid: set() for cid in all_courses}
    for p in prereqs_result.scalars().all():
        prereqs_map[p.course_id].add(p.prerequisite_course_id)

    sc_result = await db.execute(
        select(StudentCourse).where(
            StudentCourse.student_id == user["id"],
            StudentCourse.course_id.in_(all_courses.keys()),
        )
    )
    student_status = {sc.course_id: sc.status for sc in sc_result.scalars().all()}

    approved = {
        cid for cid, st in student_status.items()
        if st == "approved" and cid != body.course_id
    }
    in_progress = {
        cid for cid, st in student_status.items()
        if st == "in_progress" and cid != body.course_id
    }
    # current_sem = el semestre más alto que el estudiante ha tocado (aprobado o en curso).
    # Si no ha tocado nada, es 0 → planificación arranca en sem 1.
    max_approved_sem = max(
        (all_courses[cid].semester for cid in approved if cid in all_courses),
        default=0,
    )
    max_in_progress_sem = max(
        (all_courses[cid].semester for cid in in_progress if cid in all_courses),
        default=0,
    )
    current_sem = max(max_approved_sem, max_in_progress_sem)
    max_original_sem = max(c.semester for c in all_courses.values())

    # Materias que transitivamente dependen de la perdida → no se pueden tomar
    # hasta que se repita. Las demás ("libres") sí se pueden adelantar.
    blocked_ids = _compute_blocked_ids(prereqs_map, body.course_id)

    # Plan de referencia: materia perdida se trata como aprobada → mide el tiempo
    # que tomaría el estudiante si NO hubiera perdido la materia.
    reference_completed = approved | in_progress | {body.course_id}
    reference_plan = _greedy_schedule(
        all_courses, prereqs_map, reference_completed,
        current_sem, max_original_sem, CREDIT_BASE,
    )
    ref_last_sem = max((s["semester"] for s in reference_plan), default=max_original_sem)
    reference_delay = max(0, ref_last_sem - max_original_sem)

    advance_completed = approved | in_progress

    # Sin cambios: las materias libres NO se adelantan; cascada natural de bloqueadas.
    baseline_plan = _greedy_schedule(
        all_courses, prereqs_map, advance_completed,
        current_sem, max_original_sem, CREDIT_BASE,
        blocked_ids=blocked_ids, lost_course_id=body.course_id, mode="baseline",
    )

    # Adelantar materias: greedy + local search para comprimir la cascada al mínimo.
    # El local search mueve iterativamente cada materia al semestre más temprano
    # posible hasta que no haya más mejoras.
    advance_plan_raw = _greedy_schedule(
        all_courses, prereqs_map, advance_completed,
        current_sem, max_original_sem, CREDIT_BASE,
        blocked_ids=blocked_ids, lost_course_id=body.course_id, mode="advance",
    )
    advance_plan = _local_search_improve(
        advance_plan_raw, all_courses, prereqs_map,
        advance_completed, CREDIT_BASE, current_sem,
    )

    # Con extracréditos: búsqueda binaria del mínimo límite de créditos (17→21)
    # que logra graduation_semester <= ref_last_sem (fecha objetivo).
    # Minimiza el costo extra pagado manteniendo la misma fecha de graduación.
    extra_credit_limit, extra_plan = _min_credits_achieving_target(
        all_courses, prereqs_map, advance_completed,
        current_sem, max_original_sem,
        blocked_ids, body.course_id,
        target_last_sem=ref_last_sem,
    )
    extra_last_sem = max((s["semester"] for s in extra_plan), default=max_original_sem)
    advance_last_sem = max((s["semester"] for s in advance_plan), default=max_original_sem)
    extra_credits_helpful = extra_last_sem < advance_last_sem

    # Lista de prerequisitos para dibujar edges en React Flow
    prerequisites_list = [
        {"source": str(prereq_id), "target": str(cid)}
        for cid, prereqs in prereqs_map.items()
        for prereq_id in prereqs
    ]

    lost = all_courses[body.course_id]
    return {
        "lost_course": {
            "id": str(body.course_id),
            "name": lost.name,
            "code": lost.code,
            "credits": lost.credits,
            "semester": lost.semester,
        },
        "current_semester": current_sem,
        "program_length": max_original_sem,
        "reference_delay": reference_delay,
        "reference_last_semester": ref_last_sem,
        "prerequisites": prerequisites_list,
        "scenarios": [
            _build_scenario(
                "baseline", "Sin cambios",
                "Retomar la materia el siguiente semestre sin modificar el resto del plan",
                baseline_plan, all_courses, max_original_sem, body.course_id,
            ),
            _build_scenario(
                "advance", "Adelantar materias",
                "Mover materias futuras elegibles a semestres anteriores para reducir el atraso",
                advance_plan, all_courses, max_original_sem, body.course_id,
            ),
            _build_scenario(
                "extra_credits", "Con extracréditos",
                (
                    f"Pagar {extra_credit_limit - CREDIT_BASE} crédito(s) extra "
                    f"por semestre ({extra_credit_limit}cr máx) para graduarte en "
                    f"sem {extra_last_sem} — mínimo necesario"
                    if extra_credits_helpful
                    else "El plan de adelanto ya logra la fecha objetivo — "
                         "no se requieren extracréditos"
                ),
                extra_plan, all_courses, max_original_sem, body.course_id,
            ),
        ],
    }


@router.post("/validate")
async def validate_plan(
    body: ValidatePlanRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Valida un plan manual: verifica prerequisitos y límites de créditos."""
    courses_result = await db.execute(
        select(Course).where(Course.program_id == body.program_id)
    )
    all_courses = {c.id: c for c in courses_result.scalars().all()}

    prereqs_result = await db.execute(
        select(Prerequisite).where(Prerequisite.course_id.in_(all_courses.keys()))
    )
    prereqs_map: dict[uuid.UUID, set[uuid.UUID]] = {cid: set() for cid in all_courses}
    for p in prereqs_result.scalars().all():
        prereqs_map[p.course_id].add(p.prerequisite_course_id)

    sc_result = await db.execute(
        select(StudentCourse).where(
            StudentCourse.student_id == user["id"],
            StudentCourse.course_id.in_(all_courses.keys()),
        )
    )
    approved = {
        sc.course_id for sc in sc_result.scalars().all()
        if sc.status == "approved"
    }

    # course_id → assigned semester in the proposed plan
    plan_map = {a.course_id: a.assigned_semester for a in body.plan}
    # semester → list of course_ids
    sem_courses: dict[int, list[uuid.UUID]] = {}
    for a in body.plan:
        sem_courses.setdefault(a.assigned_semester, []).append(a.course_id)

    violations = []
    warnings = []

    for a in body.plan:
        cid = a.course_id
        if cid not in all_courses:
            violations.append({
                "type": "course_not_found",
                "course_id": str(cid),
                "detail": "Materia no encontrada en el programa",
            })
            continue

        # Check prerequisites
        for prereq_id in prereqs_map.get(cid, set()):
            if prereq_id in approved:
                continue  # already done
            prereq_sem = plan_map.get(prereq_id)
            if prereq_sem is None or prereq_sem >= a.assigned_semester:
                prereq_name = all_courses[prereq_id].name if prereq_id in all_courses else str(prereq_id)
                violations.append({
                    "type": "prerequisite_not_met",
                    "course_id": str(cid),
                    "course_name": all_courses[cid].name,
                    "detail": f"Requiere '{prereq_name}' que no está programada antes del semestre {a.assigned_semester}",
                })

    for sem, course_ids in sem_courses.items():
        credits_used = sum(
            all_courses[cid].credits for cid in course_ids if cid in all_courses
        )
        if credits_used > CREDIT_MAX:
            violations.append({
                "type": "credits_exceeded",
                "semester": sem,
                "credits_used": credits_used,
                "credits_allowed": CREDIT_MAX,
                "detail": f"Semestre {sem} tiene {credits_used} créditos, máximo permitido es {CREDIT_MAX}",
            })
        elif credits_used > CREDIT_BASE:
            extra = credits_used - CREDIT_BASE
            warnings.append({
                "type": "extra_credits_required",
                "semester": sem,
                "extra_credits": extra,
                "extra_cost": extra * EXTRA_CREDIT_COST,
                "detail": f"Semestre {sem} requiere {extra} extracrédito(s) — costo: ${extra * EXTRA_CREDIT_COST:,.0f}",
            })
        if credits_used > 14:
            warnings.append({
                "type": "high_difficulty",
                "semester": sem,
                "credits_used": credits_used,
                "detail": f"Semestre {sem} tiene carga alta ({credits_used} créditos), considera distribuir mejor",
            })

    return {
        "valid": len(violations) == 0,
        "violations": violations,
        "warnings": warnings,
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

def _course_group(code: str, name: str) -> str | None:
    """Retorna el grupo de restricción de la materia, o None si no aplica.

    Grupos con máximo 1 por semestre y sin posibilidad de adelanto:
      - 'IGL'       → idiomas (código empieza con IGL)
      - 'SEMINARIO' → seminario de carrera (nombre contiene 'seminario')

    Grupos que no se pueden adelantar (deben ir en su semestre original o posterior):
      - 'IIN'       → examen comprensivo (código empieza con IIN)
    """
    upper = code.upper()
    if upper.startswith("IGL"):
        return "IGL"
    if upper.startswith("IIN"):
        return "IIN"
    if "seminario" in name.lower():
        return "SEMINARIO"
    return None


# Grupos donde solo puede haber 1 materia por semestre
_SINGLE_PER_SEM_GROUPS = {"IGL", "SEMINARIO"}

# Grupos que no se pueden adelantar (solo en semestre original o posterior)
_NO_ADVANCE_GROUPS = {"IGL", "SEMINARIO", "IIN"}


def _plan_to_assignment(plan: list[dict]) -> dict[uuid.UUID, int]:
    """Convierte plan[{semester, course_ids}] → {course_id: semester}."""
    assignment: dict[uuid.UUID, int] = {}
    for sem_data in plan:
        for cid in sem_data["course_ids"]:
            assignment[cid] = sem_data["semester"]
    return assignment


def _assignment_to_plan(
    assignment: dict[uuid.UUID, int],
    all_courses: dict[uuid.UUID, "Course"],
) -> list[dict]:
    """Convierte {course_id: semester} → plan en formato estándar."""
    sems: dict[int, list[uuid.UUID]] = {}
    for cid, sem in assignment.items():
        sems.setdefault(sem, []).append(cid)
    result = []
    for sem in sorted(sems):
        course_ids = sems[sem]
        credits_used = sum(all_courses[cid].credits for cid in course_ids)
        extra = max(0, credits_used - CREDIT_BASE)
        result.append({
            "semester": sem,
            "course_ids": course_ids,
            "credits_used": credits_used,
            "extra_credits": extra,
            "extra_cost": extra * EXTRA_CREDIT_COST,
        })
    return result


def _can_place_course(
    cid: uuid.UUID,
    target_sem: int,
    assignment: dict[uuid.UUID, int],
    completed_base: set[uuid.UUID],
    all_courses: dict[uuid.UUID, "Course"],
    prereqs_map: dict[uuid.UUID, set[uuid.UUID]],
    credit_limit: int,
    min_sem: int,
) -> bool:
    """Devuelve True si cid puede ubicarse en target_sem sin violar ningún constraint."""
    if target_sem <= min_sem:
        return False

    c = all_courses[cid]
    group = _course_group(c.code, c.name)

    # Grupos no-adelantables solo van en su semestre original o posterior
    if group in _NO_ADVANCE_GROUPS and c.semester > target_sem:
        return False

    # Todos los prereqs deben completarse estrictamente antes de target_sem
    for p in prereqs_map.get(cid, set()):
        if p in completed_base:
            continue  # ya aprobado antes de la simulación
        placed = assignment.get(p)
        if placed is None or placed >= target_sem:
            return False

    # Créditos en target_sem (excluyendo cid mismo)
    sem_credits = sum(
        all_courses[x].credits
        for x, s in assignment.items()
        if s == target_sem and x != cid
    )
    if sem_credits + c.credits > credit_limit:
        return False

    # Grupos con máximo 1 por semestre
    if group in _SINGLE_PER_SEM_GROUPS:
        for x, s in assignment.items():
            if s == target_sem and x != cid:
                if _course_group(all_courses[x].code, all_courses[x].name) == group:
                    return False

    return True


def _local_search_improve(
    plan: list[dict],
    all_courses: dict[uuid.UUID, "Course"],
    prereqs_map: dict[uuid.UUID, set[uuid.UUID]],
    completed_base: set[uuid.UUID],
    credit_limit: int,
    min_sem: int,
    max_iters: int = 30,
) -> list[dict]:
    """Post-procesamiento: mueve cada materia al semestre más temprano posible.

    Itera hasta que no haya mejoras (o se alcance max_iters). Reduce el semestre
    de graduación al mínimo factible dado los constraints de prereqs, créditos y
    grupos especiales.

    Nota: solo se aplica en modos 'advance'/'extra' — no en 'baseline'.
    """
    if not plan:
        return plan

    assignment = _plan_to_assignment(plan)

    for _ in range(max_iters):
        improved = False
        # Procesar de semestres tempranos a tardíos para que las mejoras
        # cascadeen (mover A antes permite mover B que depende de A)
        for cid in sorted(assignment, key=lambda c: assignment[c]):
            current_assigned = assignment[cid]
            # Intentar mover a cualquier semestre anterior
            for target in range(min_sem + 1, current_assigned):
                if _can_place_course(
                    cid, target, assignment, completed_base,
                    all_courses, prereqs_map, credit_limit, min_sem,
                ):
                    assignment[cid] = target
                    improved = True
                    break  # tomar el más temprano y continuar
        if not improved:
            break

    return _assignment_to_plan(assignment, all_courses)


def _min_credits_achieving_target(
    all_courses: dict[uuid.UUID, "Course"],
    prereqs_map: dict[uuid.UUID, set[uuid.UUID]],
    completed: set[uuid.UUID],
    current_sem: int,
    max_original_sem: int,
    blocked_ids: set[uuid.UUID],
    lost_course_id: uuid.UUID,
    target_last_sem: int,
) -> tuple[int, list[dict]]:
    """Búsqueda binaria del mínimo límite de créditos (17-21) que logra
    graduation_semester <= target_last_sem usando greedy + local search.

    Objetivo: minimizar costo extra mientras se alcanza la fecha de graduación
    objetivo. Si ni con 21cr se logra, retorna el mejor plan posible con 21cr.
    """
    def _run(limit: int) -> list[dict]:
        p = _greedy_schedule(
            all_courses, prereqs_map, completed, current_sem, max_original_sem,
            limit, blocked_ids=blocked_ids, lost_course_id=lost_course_id, mode="advance",
        )
        return _local_search_improve(p, all_courses, prereqs_map, completed, limit, current_sem)

    def _last_sem(p: list[dict]) -> int:
        return max((s["semester"] for s in p), default=target_last_sem + 10)

    # Verificar si el plan sin extracréditos (17cr) ya logra el objetivo
    base_plan = _run(CREDIT_BASE)
    if _last_sem(base_plan) <= target_last_sem:
        return CREDIT_BASE, base_plan

    # Búsqueda binaria en [CREDIT_BASE+1, CREDIT_MAX]
    lo, hi = CREDIT_BASE + 1, CREDIT_MAX
    found_limit = CREDIT_MAX
    best_plan = _run(CREDIT_MAX)

    while lo <= hi:
        mid = (lo + hi) // 2
        plan = _run(mid)
        if _last_sem(plan) <= target_last_sem:
            found_limit = mid
            best_plan = plan
            hi = mid - 1
        else:
            lo = mid + 1

    return found_limit, best_plan


def _compute_blocked_ids(
    prereqs_map: dict[uuid.UUID, set[uuid.UUID]],
    lost_course_id: uuid.UUID,
) -> set[uuid.UUID]:
    """BFS hacia adelante desde la materia perdida usando el grafo inverso de prereqs.

    Retorna el set de todas las materias que NO se pueden tomar hasta que se
    repita la materia perdida (transitive dependents). La materia perdida en sí
    NO se incluye en el resultado.
    """
    # Invertir prereqs_map: course → prereqs  →  prereq → set[dependents]
    dependents: dict[uuid.UUID, set[uuid.UUID]] = {}
    for cid, prereqs in prereqs_map.items():
        for p in prereqs:
            dependents.setdefault(p, set()).add(cid)

    blocked: set[uuid.UUID] = set()
    queue = deque([lost_course_id])
    while queue:
        curr = queue.popleft()
        for dep in dependents.get(curr, set()):
            if dep not in blocked:
                blocked.add(dep)
                queue.append(dep)
    return blocked


def _greedy_schedule(
    all_courses: dict[uuid.UUID, "Course"],
    prereqs_map: dict[uuid.UUID, set[uuid.UUID]],
    completed: set[uuid.UUID],
    current_sem: int,
    max_original_sem: int,
    credit_limit: int,
    blocked_ids: set[uuid.UUID] | None = None,
    lost_course_id: uuid.UUID | None = None,
    mode: str = "advance",
) -> list[dict]:
    """Asigna greedily las materias restantes a semestres respetando prereqs,
    credit_limit y restricciones especiales por tipo de materia.

    Modos:
      baseline  — materias libres (no bloqueadas) NO se adelantan; solo van en su semestre
                  original o posterior. Las bloqueadas cascadean naturalmente.
      advance   — materias libres se jalan al semestre más temprano posible ordenando por
                  semestre original DESC, creando espacio al final para las bloqueadas.
      extra     — igual que advance pero con credit_limit=CREDIT_MAX (21 cr).
    """
    completed = set(completed)
    remaining = {cid for cid in all_courses if cid not in completed}
    _blocked = blocked_ids if blocked_ids is not None else set()

    plan = []
    sem = current_sem + 1

    while remaining and sem <= max_original_sem + 20:
        # Candidatos base: prereqs cumplidos + restricción _NO_ADVANCE_GROUPS
        eligible_base = [
            cid for cid in remaining
            if prereqs_map[cid].issubset(completed)
            and (
                _course_group(all_courses[cid].code, all_courses[cid].name)
                not in _NO_ADVANCE_GROUPS
                or all_courses[cid].semester <= sem
            )
        ]

        if mode == "baseline":
            # Materias libres solo pueden ir en su semestre original o posterior
            eligible = [
                cid for cid in eligible_base
                if (cid in _blocked or cid == lost_course_id)
                or all_courses[cid].semester <= sem
            ]
            eligible.sort(key=lambda cid: (all_courses[cid].semester, all_courses[cid].credits))
        else:
            # advance / extra:
            # 1. Materia perdida primero → recuperarla cuanto antes.
            # 2. Bloqueadas (priority 1) antes que libres (priority 2) → se ubican
            #    en el semestre más temprano posible sin que las libres les quitaran
            #    el espacio. IIN 4319 puede ir a sem 7 en lugar de esperar al sem 10.
            # 3. Libres en orden ASC por semestre original → preservan sus cadenas
            #    de prerequisitos (IST 4310→7111→7121→7122 van a sus sems naturales
            #    5→6→7→8). Si las libres fueran DESC llenarían sem 5 y desplazarían
            #    IST 4310, cascadeando toda la cadena hasta sem 11+.
            # El "avance" real viene de (2): bloqueadas que estaban restringidas a
            # sus sems originales en baseline ahora cascadean naturalmente al mínimo.
            # _local_search_improve comprime el plan aún más tras el greedy.
            eligible = eligible_base
            eligible.sort(key=lambda cid: (
                # Prioridad: perdida (0), bloqueadas (1), libres (2)
                0 if cid == lost_course_id
                else (1 if cid in _blocked else 2),
                # Todas las categorías: ASC por semestre original (orden natural)
                all_courses[cid].semester,
                all_courses[cid].credits,
            ))

        sem_courses: list[uuid.UUID] = []
        credits_used = 0
        group_counts: dict[str, int] = {}

        for cid in eligible:
            c = all_courses[cid]
            group = _course_group(c.code, c.name)
            if group in _SINGLE_PER_SEM_GROUPS and group_counts.get(group, 0) >= 1:
                continue
            if credits_used + c.credits <= credit_limit:
                sem_courses.append(cid)
                credits_used += c.credits
                if group:
                    group_counts[group] = group_counts.get(group, 0) + 1

        if sem_courses:
            extra = max(0, credits_used - CREDIT_BASE)
            plan.append({
                "semester": sem,
                "course_ids": sem_courses,
                "credits_used": credits_used,
                "extra_credits": extra,
                "extra_cost": extra * EXTRA_CREDIT_COST,
            })
            completed = completed | set(sem_courses)
            remaining -= set(sem_courses)

        sem += 1

    return plan


def _build_scenario(
    scenario_id: str,
    label: str,
    description: str,
    plan: list[dict],
    all_courses: dict[uuid.UUID, "Course"],
    reference_slots: int,
    lost_course_id: uuid.UUID | None = None,
) -> dict:
    rich_plan = []
    for sem_data in plan:
        courses_in_sem = []
        for cid in sem_data["course_ids"]:
            c = all_courses[cid]
            placed_sem = sem_data["semester"]
            original_sem = c.semester

            if placed_sem < original_sem:
                moved_from = original_sem    # adelantada
                delayed_from = None
            elif placed_sem > original_sem:
                moved_from = None
                delayed_from = original_sem  # retrasada
            else:
                moved_from = None
                delayed_from = None

            courses_in_sem.append({
                "course_id": str(cid),
                "name": c.name,
                "code": c.code,
                "credits": c.credits,
                "original_semester": c.semester,
                "moved_from": moved_from,
                "delayed_from": delayed_from,
                "is_retaken": lost_course_id is not None and cid == lost_course_id,
            })
        rich_plan.append({
            "semester": sem_data["semester"],
            "courses": courses_in_sem,
            "credits_used": sem_data["credits_used"],
            "extra_credits": sem_data["extra_credits"],
            "extra_cost": sem_data["extra_cost"],
        })

    last_sem = max((s["semester"] for s in plan), default=reference_slots)
    semesters_delayed = max(0, last_sem - reference_slots)
    total_extra_credits = sum(s["extra_credits"] for s in plan)
    total_extra_cost = sum(s["extra_cost"] for s in plan)
    difficulty = sum(max(0, s["credits_used"] - 14) * 5 for s in plan)

    return {
        "id": scenario_id,
        "label": label,
        "description": description,
        "semesters_delayed": semesters_delayed,
        "last_semester": last_sem,
        "extra_credits_count": total_extra_credits,
        "extra_credits_cost": total_extra_cost,
        "difficulty_score": difficulty,
        "plan": rich_plan,
    }

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
