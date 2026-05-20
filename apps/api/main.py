from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import admin, auth, chat, courses, simulation, student_courses

app = FastAPI(title="MaIA API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(student_courses.router)
app.include_router(simulation.router)
app.include_router(chat.router)
app.include_router(admin.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
