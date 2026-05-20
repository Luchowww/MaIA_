import uuid
from datetime import datetime
from enum import Enum as PyEnum

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger, Boolean, DateTime, ForeignKey,
    String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class UserRole(str, PyEnum):
    admin = "admin"
    student = "student"


class CourseStatus(str, PyEnum):
    approved = "approved"
    in_progress = "in_progress"
    pending = "pending"
    blocked = "blocked"
    failed = "failed"
    simulated = "simulated"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # Supabase UUID (sub claim)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(String(20), default=UserRole.student)
    is_onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Program(Base):
    __tablename__ = "programs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    courses: Mapped[list["Course"]] = relationship("Course", back_populates="program")


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    credits: Mapped[int] = mapped_column(BigInteger, nullable=False)
    semester: Mapped[int] = mapped_column(BigInteger, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    program_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"))

    program: Mapped["Program"] = relationship("Program", back_populates="courses")
    prerequisites: Mapped[list["Prerequisite"]] = relationship(
        "Prerequisite", foreign_keys="Prerequisite.course_id", back_populates="course"
    )
    dependents: Mapped[list["Prerequisite"]] = relationship(
        "Prerequisite", foreign_keys="Prerequisite.prerequisite_course_id", back_populates="prerequisite_course"
    )
    student_courses: Mapped[list["StudentCourse"]] = relationship("StudentCourse", back_populates="course")
    embeddings: Mapped[list["Embedding"]] = relationship("Embedding", back_populates="course")


class Prerequisite(Base):
    __tablename__ = "prerequisites"
    __table_args__ = (UniqueConstraint("course_id", "prerequisite_course_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    prerequisite_course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))

    course: Mapped["Course"] = relationship("Course", foreign_keys=[course_id], back_populates="prerequisites")
    prerequisite_course: Mapped["Course"] = relationship(
        "Course", foreign_keys=[prerequisite_course_id], back_populates="dependents"
    )


class StudentCourse(Base):
    __tablename__ = "student_courses"
    __table_args__ = (UniqueConstraint("student_id", "course_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[str] = mapped_column(String, nullable=False)  # Supabase auth user UUID as string
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    status: Mapped[CourseStatus] = mapped_column(String(20), default=CourseStatus.pending)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    course: Mapped["Course"] = relationship("Course", back_populates="student_courses")


class Embedding(Base):
    __tablename__ = "embeddings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "course", "regulation", etc.
    source_id: Mapped[str | None] = mapped_column(String)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(768))
    course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True)

    course: Mapped["Course | None"] = relationship("Course", back_populates="embeddings")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
