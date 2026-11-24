import asyncio
import io
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
from sqlmodel import col, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.chunking import chunk_pages
from app.config import settings
from app.db import get_session, init_db
from app.models import Chunk, Document
from app.schemas import DocumentRead


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="ContractBuddy API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def extract_pages(data: bytes) -> list[str]:
    """Return the text of each page (index 0 = page 1). Pages without a text layer give ""."""
    reader = PdfReader(io.BytesIO(data))
    return [page.extract_text() or "" for page in reader.pages]


@app.post("/documents", status_code=201, response_model=DocumentRead)
async def upload_document(file: UploadFile, session: AsyncSession = Depends(get_session)):
    filename = file.filename or "upload.pdf"
    data = await file.read()

    # Check the content, not just the name: every PDF starts with "%PDF-" (within the first 1 KB).
    if not filename.lower().endswith(".pdf") or b"%PDF-" not in data[:1024]:
        raise HTTPException(400, "Only PDF files are accepted.")

    try:
        # pypdf is synchronous and can take seconds on big PDFs: run it in a worker thread
        # so the server keeps answering other requests meanwhile.
        pages = await asyncio.to_thread(extract_pages, data)
    except Exception:  # pypdf raises many different error types for broken/odd files
        raise HTTPException(400, "Could not read the PDF. The file may be damaged or password-protected.")

    chunks = chunk_pages(pages)
    if not chunks:
        raise HTTPException(
            422, "No text found in the PDF. Scanned documents (images only) are not supported."
        )

    document = Document(filename=filename, page_count=len(pages))
    session.add(document)
    await session.flush()  # sends the INSERT so document.id is known; still one transaction
    session.add_all(
        Chunk(document_id=document.id, page_number=c.page_number, chunk_index=c.chunk_index, text=c.text)
        for c in chunks
    )
    await session.commit()

    return DocumentRead(**document.model_dump(), chunk_count=len(chunks))


@app.get("/documents", response_model=list[DocumentRead])
async def list_documents(session: AsyncSession = Depends(get_session)):
    statement = (
        select(Document, func.count(col(Chunk.id)))
        .outerjoin(Chunk, col(Chunk.document_id) == col(Document.id))
        .group_by(col(Document.id))
        .order_by(col(Document.uploaded_at).desc(), col(Document.id).desc())
    )
    rows = (await session.exec(statement)).all()
    return [DocumentRead(**doc.model_dump(), chunk_count=count) for doc, count in rows]


@app.delete("/documents/{document_id}", status_code=204)
async def delete_document(document_id: int, session: AsyncSession = Depends(get_session)):
    document = await session.get(Document, document_id)
    if document is None:
        raise HTTPException(404, f"Document {document_id} not found.")
    await session.delete(document)  # chunks are removed by the database (ON DELETE CASCADE)
    await session.commit()
    return Response(status_code=204)
