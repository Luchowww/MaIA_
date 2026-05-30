"""
Fix: Examen Comprensivo I — mover a semestre 6 y restaurar prerequisitos reales.

El comprensivo se toma en vacaciones entre sem 5 y 6, por lo que en el sistema
se modela como semestre 6 (antes de arrancar 6to semestre).

Cambios:
  IIN 4310 (Examen Comprehensivo I): sem 5 → 6, agregar prereqs MAT/FIS
  IIN 4319 (Examen Comprehensivo II): ya está en sem 9, sin cambios

Correr desde apps/api/:
    python3 fix_comprensivos.py
"""

import asyncio

from sqlalchemy import delete, select, update

from database import AsyncSessionLocal as Session
from models import Course, Prerequisite, Program

PREREQ_CODES = ["MAT 4011", "MAT 1121", "FIS 1023", "FIS 1033", "FIS 1043"]


async def fix():
    async with Session() as db:
        # Buscar el programa
        prog_result = await db.execute(
            select(Program).where(Program.name == "Ingeniería de Sistemas y Computación")
        )
        program = prog_result.scalar_one_or_none()
        if not program:
            print("❌  Programa no encontrado.")
            return
        print(f"✓  Programa: {program.name} ({program.id})")

        # Obtener todos los cursos relevantes de una vez
        codes_needed = ["IIN 4310", "IIN 4319"] + PREREQ_CODES
        courses_result = await db.execute(
            select(Course).where(
                Course.program_id == program.id,
                Course.code.in_(codes_needed),
            )
        )
        courses = {c.code: c for c in courses_result.scalars().all()}

        # ── IIN 4310: semestre 6 + prereqs ──────────────────────────────────
        comp1 = courses.get("IIN 4310")
        if not comp1:
            print("❌  IIN 4310 no encontrado.")
        else:
            # Mover a semestre 6
            await db.execute(
                update(Course).where(Course.id == comp1.id).values(semester=6)
            )
            print(f"  ✓  IIN 4310: sem {comp1.semester} → 6")

            # Limpiar prereqs existentes (por si acaso)
            await db.execute(
                delete(Prerequisite).where(Prerequisite.course_id == comp1.id)
            )

            # Insertar los 5 prereqs correctos
            added = []
            for code in PREREQ_CODES:
                prereq_course = courses.get(code)
                if not prereq_course:
                    print(f"  ⚠  Prereq {code} no encontrado en la BD, se omite.")
                    continue
                db.add(Prerequisite(
                    course_id=comp1.id,
                    prerequisite_course_id=prereq_course.id,
                ))
                added.append(code)
            print(f"  ✓  Prereqs agregados: {', '.join(added)}")

        # ── IIN 4319: ya está en sem 9, solo confirmar ───────────────────────
        comp2 = courses.get("IIN 4319")
        if not comp2:
            print("❌  IIN 4319 no encontrado.")
        else:
            print(f"  ✓  IIN 4319: sem {comp2.semester} (sin cambios)")

        await db.commit()
        print("\n✅  Fix aplicado correctamente.")


if __name__ == "__main__":
    asyncio.run(fix())
