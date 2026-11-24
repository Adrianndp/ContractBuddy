"""API request/response schemas (not tables). Table models live in app/models.py."""

from datetime import datetime
from typing import Literal

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
