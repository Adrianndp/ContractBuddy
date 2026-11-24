# Manual Buddy – Backend

## Goal
A small RAG app: users upload PDF manuals (washing machine, router, …) and ask questions about them.
Every answer must cite the source document and page number.

## Hard rule
**Never read, create, modify or delete anything in `../frontend`, and never run commands there.**
The frontend is built separately with Lovable against the API contract below. All backend work happens in this folder (`backend/`).

Start Claude Code sessions from this folder (`cd backend && claude`) so this file is loaded.

## Tech stack & decisions
- **FastAPI**, async endpoints. Blocking work (pypdf parsing) runs in a thread (`asyncio.to_thread`) so it doesn't block the event loop.
- **SQLModel** models on an async SQLAlchemy engine (`asyncpg` driver; `sqlalchemy[asyncio]` is listed explicitly because SQLAlchemy 2.1 no longer installs `greenlet` by default). Tables are created with `SQLModel.metadata.create_all()` at startup (after `CREATE EXTENSION IF NOT EXISTS vector`). No Alembic yet.
- **Postgres + pgvector** via `docker-compose.yml` in this folder (image `pgvector/pgvector:pg17`, Compose project `manualbuddy`, volume `manualbuddy_pgdata`). Exposed on host port **5433**, because 5432 is taken by a local Postgres on this machine.
- **pypdf** for text extraction. No OCR: scanned PDFs without a text layer are rejected with a clear error.
- **Ollama** runs locally on the host (not in Docker) and handles both embeddings and chat, via the official `ollama` package (`AsyncClient`).
  - Default embedding model: `bge-m3` (1024 dims, multilingual, because manuals may be German or English). bge-m3 needs no query/passage prefixes.
  - Default chat model: `llama3.2:3b`. You can switch to a bigger one in `.env`.
  - If Ollama can't be reached or a model isn't pulled, the API returns **503** with a readable `detail`, e.g. `"Model 'bge-m3' not found in Ollama. Run: ollama pull bge-m3"`.
- **pgvector column dimension comes from config** (`EMBEDDING_DIM`).
  ⚠️ **Changing the embedding model (or its dimension) means dropping the tables and re-uploading all documents.** Vectors from different models aren't comparable, and `create_all()` doesn't alter existing columns.
- **Chunking**: per page, ~500 chars with ~50 overlap, never crossing page boundaries (so every chunk has exactly one page number to cite). Splits prefer whitespace so words aren't cut.
- **Retrieval**: top 5 chunks by cosine distance (`<=>`). Exact search, no ANN index yet; that's fine up to tens of thousands of chunks.
- **Upload is all-or-nothing**: document and chunks (with embeddings) are written in one transaction, so if embedding fails nothing is stored.
- **Config**: pydantic-settings reading `backend/.env` (template: `.env.example`; `.env` is git-ignored).
- **Python env**: Python 3.14, venv at `backend/.venv`, dependencies pinned in `backend/requirements.txt` (pip).
- **CORS**: allowed origins come from `CORS_ORIGINS`.
- **Tests**: pytest. Ollama calls are mocked.
- Keep it simple: no auth, no background jobs, no extra layers.

## Folder structure
```
backend/
├── CLAUDE.md
├── docker-compose.yml     # Postgres + pgvector
├── requirements.txt
├── .venv/                 # virtualenv (git-ignored)
├── .env.example           # copy to .env
├── .env                   # local config (git-ignored)
├── .gitignore
├── app/
│   ├── __init__.py
│   ├── main.py            # FastAPI app, CORS, startup (create tables), endpoints
│   ├── config.py          # pydantic-settings
│   ├── db.py              # async engine + session dependency
│   ├── models.py          # SQLModel tables (Document, Chunk) + request/response schemas
│   ├── chunking.py        # pure chunking function (easy to test)
│   └── llm.py             # Ollama embed/chat calls + error translation
└── tests/
    ├── test_chunking.py
    └── test_endpoints.py
```

## Data model
- **Document**: `id` (int PK), `filename` (str), `uploaded_at` (UTC datetime), `page_count` (int)
- **Chunk**: `id` (int PK), `document_id` (FK → Document, ON DELETE CASCADE), `page_number` (int, 1-based), `chunk_index` (int, order within the document), `text` (str), `embedding` (vector(`EMBEDDING_DIM`), nullable until step 3)

## Configuration (`.env`)
| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://manualbuddy:manualbuddy@localhost:5433/manualbuddy` | Postgres connection |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama on the host |
| `EMBEDDING_MODEL` | `bge-m3` | Embedding model |
| `EMBEDDING_DIM` | `1024` | Must match the embedding model |
| `CHAT_MODEL` | `llama3.2:3b` | Chat model |
| `CORS_ORIGINS` | `["http://localhost:8080"]` | JSON list of allowed frontend origins |

## API contract
Base URL: `http://localhost:8000`. Interactive docs: `/docs`.
Errors always use FastAPI's format: `{"detail": "<human readable message>"}`.
Status markers: ✅ implemented · ⏳ planned.

### ⏳ `POST /documents`: upload a PDF
- Request: `multipart/form-data` with a field `file` (PDF).
- `201 Created`:
  ```json
  {"id": 1, "filename": "router.pdf", "uploaded_at": "2026-11-24T14:00:00Z", "page_count": 42, "chunk_count": 180}
  ```
- `400` not a PDF / unreadable PDF · `422` PDF has no extractable text (e.g. scanned) · `503` Ollama unavailable / model missing (from step 3)

### ⏳ `GET /documents`: list documents
- `200 OK` (newest first):
  ```json
  [{"id": 1, "filename": "router.pdf", "uploaded_at": "2026-11-24T14:00:00Z", "page_count": 42, "chunk_count": 180}]
  ```

### ⏳ `DELETE /documents/{id}`: delete a document and its chunks
- `204 No Content` · `404` unknown id

### ⏳ `POST /ask`: ask a question
- Request:
  ```json
  {"question": "How do I reset the router?", "document_ids": [1, 2]}
  ```
  `document_ids` is optional (omit or `null` = search all documents). `question` must be non-empty.
- `200 OK`:
  ```json
  {
    "answer": "Hold the reset button for 10 seconds … [1]",
    "sources": [
      {"document_id": 1, "filename": "router.pdf", "page_number": 12, "text_snippet": "To reset the device …"}
    ]
  }
  ```
  `sources` is ordered by relevance (max 5). In step 4 `answer` is `null` (retrieval only).
- `503` Ollama unavailable / model missing

## How to run
All commands run from `backend/`.

```bash
# 1. Database (Postgres + pgvector)
docker compose up -d            # start
docker compose down             # stop (data kept)
docker compose down -v          # stop AND delete all data (needed after changing the embedding model)
docker compose exec db psql -U manualbuddy   # SQL shell (e.g. \d chunk)

# 2. Ollama (on the host, not Docker)
ollama serve                    # if not already running as a service
ollama pull bge-m3
ollama pull llama3.2:3b

# 3. Python env + app
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # first time only
uvicorn app.main:app --reload   # → http://localhost:8000/docs

# 4. Tests
pytest
```

## Progress
- [x] 1. docker-compose with Postgres + pgvector, DB connection, models, create tables
- [ ] 2. `POST /documents`: upload, text extraction, chunking (no embeddings yet), plus `GET /documents` and `DELETE /documents/{id}`
- [ ] 3. Embeddings with Ollama: store a vector for every chunk
- [ ] 4. `POST /ask` returning only the retrieved chunks (no LLM yet) to check retrieval quality
- [ ] 5. Add the Ollama chat call to `/ask`
- [ ] 6. Tests for the chunking logic and the endpoints (Ollama mocked)
