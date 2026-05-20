from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

import ollama

from auth import get_current_user
from config import settings
from database import get_db
from models import ChatMessage, Embedding, StudentCourse

router = APIRouter(prefix="/chat", tags=["chat"])

ollama_client = ollama.AsyncClient(host=settings.ollama_url)


class MessageRequest(BaseModel):
    content: str


@router.post("/message")
async def send_message(
    body: MessageRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    # 1. Embed the question
    embed_response = await ollama_client.embed(model="nomic-embed-text", input=body.content)
    query_embedding = embed_response.embeddings[0]

    # 2. Vector search in pgvector
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"
    similar = await db.execute(
        text(
            "SELECT content FROM embeddings ORDER BY embedding <-> :emb LIMIT 5"
        ),
        {"emb": embedding_str},
    )
    context_chunks = [row[0] for row in similar.fetchall()]

    # 3. Get student academic context
    sc_result = await db.execute(
        select(StudentCourse).where(StudentCourse.student_id == user["id"])
    )
    student_courses = sc_result.scalars().all()
    academic_summary = ", ".join(
        f"{sc.course_id}:{sc.status}" for sc in student_courses
    ) or "Sin materias registradas"

    # 4. Build prompt
    context_text = "\n".join(context_chunks) if context_chunks else "Sin contexto adicional."
    system_prompt = (
        "Eres MaIA, un asistente académico inteligente. "
        "Ayuda al estudiante con preguntas sobre su malla curricular y situación académica. "
        "Sé conciso y claro.\n\n"
        f"Contexto académico relevante:\n{context_text}\n\n"
        f"Estado académico del estudiante:\n{academic_summary}"
    )

    # 5. Retrieve conversation history (last 10 messages)
    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user["id"])
        .order_by(ChatMessage.created_at.desc())
        .limit(10)
    )
    history = list(reversed(history_result.scalars().all()))
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": body.content})

    # 6. Call LLM
    response = await ollama_client.chat(model="gemma3:4b", messages=messages)
    assistant_content = response.message.content

    # 7. Persist both messages
    db.add(ChatMessage(user_id=user["id"], role="user", content=body.content))
    db.add(ChatMessage(user_id=user["id"], role="assistant", content=assistant_content))
    await db.commit()

    return {"role": "assistant", "content": assistant_content}
