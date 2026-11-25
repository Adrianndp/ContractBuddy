import asyncio
import io
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ollama import AsyncClient
from pypdf import PdfReader
from sqlalchemy import text
from sqlmodel import col, func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.chunking import chunk_pages
from app.config import settings
from app.db import engine, get_session, init_db
from app.models import Chunk, Document
from app.ollama import chat
from app.schemas import AskRequest, AskResponse, ChunkRead, DocumentRead, HealthRead

HEALTH_TIMEOUT_S = 3  # a health check must answer fast, even when a dependency hangs


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


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Return 422s as {"detail": "<string>"} like every other error (FastAPI's default is a list)."""
    messages = []
    for error in exc.errors():
        field = ".".join(str(part) for part in error["loc"] if part != "body")
        messages.append(f"{field}: {error['msg']}" if field else error["msg"])
    return JSONResponse(status_code=422, content={"detail": "; ".join(messages)})


async def check_database() -> None:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))


async def check_ollama() -> None:
    await AsyncClient(host=settings.ollama_base_url).list()


async def status_of(check) -> str:
    try:
        await asyncio.wait_for(check(), HEALTH_TIMEOUT_S)
        return "ok"
    except Exception:
        return "error"


@app.get("/health", response_model=HealthRead)
async def health():
    """Always 200: the body says which dependency is down, so the frontend can show it."""
    database, ollama = await asyncio.gather(status_of(check_database), status_of(check_ollama))
    return HealthRead(database=database, ollama=ollama)


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


@app.get("/documents/{document_id}/chunks", response_model=list[ChunkRead])
async def list_chunks(document_id: int, session: AsyncSession = Depends(get_session)):
    if await session.get(Document, document_id) is None:
        raise HTTPException(404, f"Document {document_id} not found.")
    statement = (
        select(Chunk).where(col(Chunk.document_id) == document_id).order_by(col(Chunk.chunk_index))
    )
    chunks = (await session.exec(statement)).all()
    return [ChunkRead(chunk_index=c.chunk_index, page_number=c.page_number, text=c.text) for c in chunks]


@app.delete("/documents/{document_id}", status_code=204)
async def delete_document(document_id: int, session: AsyncSession = Depends(get_session)):
    document = await session.get(Document, document_id)
    if document is None:
        raise HTTPException(404, f"Document {document_id} not found.")
    await session.delete(document)  # chunks are removed by the database (ON DELETE CASCADE)
    await session.commit()
    return Response(status_code=204)


@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest):
    # Simple version: the question goes straight to the chat model, no retrieval/sources yet.
    return AskResponse(answer=await chat(request.question), sources=[])
