"""
Curriculum upload: parses a PDF or image file using text extraction + LLM (gemma3:4b),
returns a preview of detected courses for the admin to review before confirming.
"""
import io
import json
import uuid

import ollama
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_admin
from config import settings
from database import get_db
from models import Course, Prerequisite

router = APIRouter(prefix="/admin/curriculum", tags=["admin-curriculum"])

ollama_client = ollama.AsyncClient(host=settings.ollama_url)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _extract_pdf_text(content: bytes) -> str:
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"No se pudo leer el PDF: {e}")


def _extract_image_text(content: bytes) -> str:
    try:
        import pytesseract
        from PIL import Image
        img = Image.open(io.BytesIO(content))
        return pytesseract.image_to_string(img, lang="spa+eng")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"No se pudo leer la imagen (OCR): {e}")


async def _parse_with_llm(raw_text: str) -> list[dict]:
    """Sends extracted text to gemma3:4b and asks for structured JSON of courses."""
    prompt = (
        "Eres un asistente que extrae información estructurada de mallas curriculares universitarias.\n\n"
        "Del siguiente texto extraído de una malla curricular, extrae TODOS los cursos/materias que encuentres.\n"
        "Devuelve ÚNICAMENTE un array JSON válido con esta estructura (sin texto adicional, sin markdown):\n"
        '[\n  {"code": "MAT101", "name": "Cálculo Diferencial", "credits": 3, "semester": 1, '
        '"prerequisite_codes": ["MAT001"]},\n  ...\n]\n\n'
        "Reglas:\n"
        "- code: código alfanumérico de la materia (ej. MAT101, ICC1A)\n"
        "- name: nombre completo de la materia\n"
        "- credits: número entero de créditos (usa 3 si no está claro)\n"
        "- semester: número de semestre (entero, usa 1 si no está claro)\n"
        "- prerequisite_codes: lista de códigos de prerequisitos (vacía [] si no tiene)\n\n"
        f"Texto de la malla:\n{raw_text[:6000]}"
    )

    response = await ollama_client.chat(
        model="gemma3:4b",
        messages=[{"role": "user", "content": prompt}],
        options={"temperature": 0.1},
    )
    raw = response.message.content.strip()

    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            raise ValueError("Expected a JSON array")
        return parsed
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(
            status_code=422,
            detail=f"El LLM no devolvió JSON válido: {e}. Respuesta: {raw[:300]}",
        )


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ParsedCourse(BaseModel):
    code: str
    name: str
    credits: int = 3
    semester: int = 1
    prerequisite_codes: list[str] = []


class ConfirmUploadBody(BaseModel):
    program_id: uuid.UUID
    courses: list[ParsedCourse]


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_curriculum(
    program_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    _admin=Depends(require_admin),
):
    """
    Accepts a PDF or image of a curriculum. Extracts text and uses LLM to parse
    it into a list of courses. Returns a preview — does NOT save to DB yet.
    """
    content = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith(".pdf"):
        raw_text = _extract_pdf_text(content)
    elif filename.endswith((".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp")):
        raw_text = _extract_image_text(content)
    else:
        raise HTTPException(
            status_code=415,
            detail="Formato no soportado. Usa PDF o imagen (PNG, JPG, JPEG, WEBP).",
        )

    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="No se pudo extraer texto del archivo.")

    courses = await _parse_with_llm(raw_text)
    return {"program_id": str(program_id), "courses": courses, "raw_text_length": len(raw_text)}


@router.post("/confirm", status_code=status.HTTP_201_CREATED)
async def confirm_curriculum(
    body: ConfirmUploadBody,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    """
    Bulk creates courses and prerequisite relationships from the reviewed/confirmed list.
    Skips duplicate codes within the same program.
    """
    from sqlalchemy import select

    # Build code → Course map for existing courses in this program
    existing_result = await db.execute(
        select(Course).where(Course.program_id == body.program_id)
    )
    existing_courses = {c.code: c for c in existing_result.scalars().all()}

    # Create missing courses
    code_to_course: dict[str, Course] = dict(existing_courses)
    new_courses: list[Course] = []

    for pc in body.courses:
        if pc.code not in code_to_course:
            course = Course(
                code=pc.code,
                name=pc.name,
                credits=pc.credits,
                semester=pc.semester,
                program_id=body.program_id,
            )
            db.add(course)
            new_courses.append(course)
            code_to_course[pc.code] = course

    await db.flush()  # get IDs for new courses without committing

    # Create prerequisite relationships
    created_prereqs = 0
    for pc in body.courses:
        course = code_to_course.get(pc.code)
        if not course:
            continue
        for prereq_code in pc.prerequisite_codes:
            prereq_course = code_to_course.get(prereq_code)
            if not prereq_course:
                continue
            # Check if already exists
            existing_prereq = await db.execute(
                select(Prerequisite).where(
                    Prerequisite.course_id == course.id,
                    Prerequisite.prerequisite_course_id == prereq_course.id,
                )
            )
            if existing_prereq.scalar_one_or_none() is None:
                db.add(Prerequisite(course_id=course.id, prerequisite_course_id=prereq_course.id))
                created_prereqs += 1

    await db.commit()

    return {
        "created_courses": len(new_courses),
        "skipped_existing": len(body.courses) - len(new_courses),
        "created_prerequisites": created_prereqs,
    }
