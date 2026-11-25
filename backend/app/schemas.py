"""API request/response schemas (not tables). Table models live in app/models.py."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import StringConstraints
from sqlmodel import SQLModel


class DocumentRead(SQLModel):
    id: int
    filename: str
    uploaded_at: datetime
    page_count: int
    chunk_count: int


class ChunkRead(SQLModel):
    chunk_index: int
    page_number: int
    text: str


class HealthRead(SQLModel):
    database: Literal["ok", "error"]
    ollama: Literal["ok", "error"]


class AskRequest(SQLModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    document_ids: list[int] | None = None  # None = search all documents


class SourceRead(SQLModel):
    document_id: int
    filename: str
    page_number: int
    text_snippet: str
    distance: float


class AskResponse(SQLModel):
    answer: str | None  # None while /ask only does retrieval (step 4)
    sources: list[SourceRead]
