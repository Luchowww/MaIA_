from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import admin, auth, chat, courses, curriculum_upload, onboarding, simulation, student_courses
from routers.courses import programs_router

app = FastAPI(title="MaIA API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(programs_router)
app.include_router(courses.router)
app.include_router(student_courses.router)
app.include_router(simulation.router)
app.include_router(chat.router)
app.include_router(admin.router)
app.include_router(curriculum_upload.router)
app.include_router(onboarding.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
