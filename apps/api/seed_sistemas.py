"""
Seed: Ingeniería de Sistemas y Computación - Universidad del Norte
Correr con: python seed_sistemas.py
"""
import asyncio
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from dotenv import load_dotenv
from config import settings
from models import Base, Program, Course, Prerequisite

load_dotenv()

engine = create_async_engine(settings.database_url)
Session = async_sessionmaker(engine, expire_on_commit=False)

# ── Cursos: (code, name, credits, semester) ─────────────────────────────────
COURSES = [
    # Semestre 1
    ("MAT 1031", "Álgebra Lineal", 3, 1),
    ("MAT 1101", "Cálculo I - Diferencial", 5, 1),
    ("IST 0010", "Intro. a la Ing. de Sistemas", 1, 1),
    ("IST 2088", "Algoritmia y Programación I", 3, 1),
    ("CAS 3020", "Competencias Comunicativas I", 3, 1),
    ("IGL 1010", "Exigencia de Idiomas I", 0, 1),
    # Semestre 2
    ("ELG 1140", "Electiva en Historia", 3, 2),
    ("MAT 1111", "Cálculo II - Integral", 4, 2),
    ("FIS 1023", "Física Mecánica", 4, 2),
    ("IST 2089", "Algoritmia y Programación II", 3, 2),
    ("CAS 3030", "Competencias Comunicativas II", 3, 2),
    ("IGL 1020", "Exigencia de Idiomas II", 0, 2),
    # Semestre 3
    ("ELG 1130", "Electiva en Humanidades", 3, 3),
    ("MAT 1121", "Cálculo III - Vectorial", 4, 3),
    ("FIS 1033", "Física Calor-Ondas", 4, 3),
    ("IST 4021", "Estructura de Datos I", 3, 3),
    ("IST 2110", "Programación Orientada a Objetos", 3, 3),
    ("IGL 1030", "Exigencia de Idiomas III", 0, 3),
    # Semestre 4
    ("ELG 1150", "Electiva en Ciencias de la Vida", 3, 4),
    ("MAT 4011", "Ecuaciones Diferenciales", 3, 4),
    ("FIS 1043", "Física Electricidad", 4, 4),
    ("IST 4031", "Estructura de Datos II", 3, 4),
    ("MAT 4021", "Matemáticas Discretas", 3, 4),
    ("IGL 1040", "Exigencia de Idiomas IV", 0, 4),
    # Semestre 5
    ("ELG 0007", "Electiva en Ciencias Básicas", 3, 5),
    ("EST 7042", "Análisis de Datos en Ing. I", 4, 5),
    ("IST 4310", "Algoritmia y Complejidad", 3, 5),
    ("IST 4330", "Estructuras Discretas", 3, 5),
    ("IST 7072", "Diseño Digital", 3, 5),
    ("IGL 4010", "Exigencia de Idiomas V", 0, 5),
    # Semestre 6
    ("ELG 0008", "Electiva Básica Profesional", 3, 6),
    ("IST 4360", "Soluciones Computacionales a Problemas de Ing.", 3, 6),
    ("IST 7111", "Bases de Datos", 3, 6),
    ("IST 7191", "Redes de Computación", 3, 6),
    ("IST 4012", "Estructura del Computador I", 3, 6),
    ("IGL 4040", "Exigencia de Idiomas VI", 0, 6),
    # Semestre 7
    ("ELG 1170", "Electiva en Ética", 3, 7),
    ("IST 7420", "Optimización", 3, 7),
    ("IST 7121", "Diseño de Software I", 3, 7),
    ("IST 70811", "Sistemas Operativos", 3, 7),
    ("IST 7102", "Estructura del Computador II", 3, 7),
    ("IGL 7030", "Exigencia de Idiomas VII", 0, 7),
    # Semestre 8
    ("ELG 1190", "Electiva en Ciencias Sociales", 3, 8),
    ("ELG 1301", "Electiva Profesional I", 3, 8),
    ("IST 7122", "Diseño de Software II", 3, 8),
    ("ELG 1302", "Electiva en Redes", 2, 8),
    ("IST 7410", "Compiladores", 3, 8),
    ("ELG 8400", "Electiva en Innovación, Desarrollo y Sociedad", 3, 8),
    ("IGL 7080", "Exigencia de Idiomas VIII", 0, 8),
    # Semestre 9
    ("ELG 1160", "Electiva en Filosofía", 3, 9),
    ("ELG 1305", "Electiva Profesional II", 3, 9),
    ("ELG 1303", "Electiva Ciencias de la Computación", 3, 9),
    ("ELG 1304", "Electiva Gestión Informática", 3, 9),
    ("ELP 4030", "Electiva Formación Complementaria I", 3, 9),
    # Semestre 10
    ("ELG 1180", "Electiva en Estudios del Caribe", 3, 10),
    ("ELG 1306", "Electiva Profesional III", 3, 10),
    ("INV 7363", "Proyecto Final", 3, 10),
    ("ELP 8090", "Electiva Formación Complementaria II", 3, 10),
    # Exámenes comprensivos (intersemestrales — se presentan en vacaciones)
    # Sus prereqs pueden estar en el MISMO semestre (al finalizar ese semestre)
    ("IIN 4310", "Examen Comprehensivo I", 0, 5),   # vacaciones entre sem 5 y 6
    ("IIN 4319", "Examen Comprehensivo II", 0, 9),  # vacaciones entre sem 9 y 10
    ("IST 4370", "Seminario de Carrera I", 0, 10),
    ("IST 4380", "Seminario de Carrera II", 0, 10),
]

# ── Prerrequisitos: (course_code, prereq_code) ───────────────────────────────
PREREQUISITES = [
    # Semestre 2
    ("MAT 1111", "MAT 1101"),
    ("FIS 1023", "MAT 1101"),
    ("IST 2089", "IST 2088"),
    ("CAS 3030", "CAS 3020"),
    # Semestre 3
    ("MAT 1121", "MAT 1111"),
    ("MAT 1121", "MAT 1031"),
    ("FIS 1033", "MAT 1101"),
    ("FIS 1033", "FIS 1023"),
    ("IST 4021", "IST 2089"),
    ("IST 2110", "IST 2089"),
    # Semestre 4
    ("MAT 4011", "MAT 1111"),
    ("FIS 1043", "FIS 1023"),
    ("FIS 1043", "MAT 1111"),
    ("IST 4031", "IST 4021"),
    # Semestre 5
    ("EST 7042", "MAT 1111"),
    ("IST 4310", "IST 4031"),
    ("IST 4330", "MAT 4021"),
    ("IST 7072", "MAT 4021"),
    # Semestre 6
    ("IST 4360", "IST 2088"),
    ("IST 4360", "MAT 4011"),
    ("IST 7111", "IST 4310"),
    ("IST 4012", "IST 7072"),
    # Semestre 7
    ("IST 7420", "EST 7042"),
    ("IST 7420", "IST 4310"),
    ("IST 7121", "IST 7111"),
    ("IST 70811", "IST 4012"),
    ("IST 7102", "IST 4012"),
    # Semestre 8
    ("IST 7122", "IST 7121"),
    ("ELG 1302", "IST 7191"),
    ("IST 7410", "IST 4031"),
    ("IST 7410", "IST 2110"),
    # Semestre 10
    ("ELP 8090", "IST 7122"),
    ("ELP 8090", "IGL 7080"),
    ("ELP 8090", "IIN 4319"),
    # Comprensivo I: requiere haber aprobado las materias base de ciencias al final del sem 5
    ("IIN 4310", "MAT 4011"),
    ("IIN 4310", "MAT 1121"),
    ("IIN 4310", "FIS 1023"),
    ("IIN 4310", "FIS 1033"),
    ("IIN 4310", "FIS 1043"),
    # IIN 4319 no tiene prerequisitos
]


async def seed():
    async with Session() as db:
        # Verificar si ya existe el programa
        existing = await db.execute(
            select(Program).where(Program.name == "Ingeniería de Sistemas y Computación")
        )
        if existing.scalar_one_or_none():
            print("El programa ya existe. Abortando seed.")
            return

        # Crear programa
        program = Program(name="Ingeniería de Sistemas y Computación")
        db.add(program)
        await db.flush()
        print(f"Programa creado: {program.id}")

        # Crear cursos
        code_to_id: dict[str, uuid.UUID] = {}
        for code, name, credits, semester in COURSES:
            course = Course(
                code=code,
                name=name,
                credits=credits,
                semester=semester,
                program_id=program.id,
            )
            db.add(course)
            await db.flush()
            code_to_id[code] = course.id

        print(f"{len(COURSES)} cursos creados.")

        # Crear prerrequisitos
        prereq_count = 0
        for course_code, prereq_code in PREREQUISITES:
            if course_code not in code_to_id or prereq_code not in code_to_id:
                print(f"  SKIP: {course_code} -> {prereq_code} (código no encontrado)")
                continue
            db.add(Prerequisite(
                course_id=code_to_id[course_code],
                prerequisite_course_id=code_to_id[prereq_code],
            ))
            prereq_count += 1

        await db.commit()
        print(f"{prereq_count} prerrequisitos creados.")
        print("Seed completado exitosamente.")


if __name__ == "__main__":
    asyncio.run(seed())
