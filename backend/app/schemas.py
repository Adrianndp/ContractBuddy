"""API request/response schemas (not tables). Table models live in app/models.py."""

from datetime import datetime

from sqlmodel import SQLModel


class DocumentRead(SQLModel):
    id: int
    filename: str
    uploaded_at: datetime
    page_count: int
    chunk_count: int
