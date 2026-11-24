from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Text
from sqlmodel import Field, SQLModel

from app.config import settings


class Document(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    filename: str
    uploaded_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    page_count: int


class Chunk(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    # ondelete=CASCADE: Postgres removes a document's chunks when the document is deleted.
    document_id: int = Field(foreign_key="document.id", ondelete="CASCADE", index=True)
    page_number: int  # 1-based, as printed in PDF viewers
    chunk_index: int  # order of the chunk within its document
    text: str = Field(sa_type=Text)
    # Dimension comes from config. Nullable until embeddings are added (step 3).
    embedding: list[float] | None = Field(default=None, sa_type=Vector(settings.embedding_dim))


# --- API schemas (not tables) ---


class DocumentRead(SQLModel):
    id: int
    filename: str
    uploaded_at: datetime
    page_count: int
    chunk_count: int
