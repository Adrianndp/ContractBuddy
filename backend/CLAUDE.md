# ContractBuddy – Backend

## Goal
A small RAG app for asking questions about my own contracts (rental, phone, insurance, employment, …), mostly in German.
I upload the contract PDFs and ask questions like "Wie lange ist die Kündigungsfrist?"; the app answers from the contract text.
Every answer must cite the source document and page number.

## Privacy: everything runs locally on purpose
Contracts contain personal data (names, addresses, IBANs, salaries, …). That's why the whole stack runs on this machine:
Postgres in local Docker, Ollama on the host for embeddings and chat. **Don't add cloud APIs, hosted LLMs/embedding services,
telemetry or any other external calls** that would send document text or questions off the machine.

The database name and user are still `manualbuddy` (from the old project name). That's intentional for now; don't rename them and don't touch `docker-compose.yml`.

## Hard rule
**Never read, create, modify or delete anything in `../frontend`, and never run commands there.**
The frontend is built separately with Lovable against the API contract below. All backend work happens in this folder (`backend/`).

Start Claude Code sessions from this folder (`cd backend && claude`) so this file is loaded.

## Tech stack & decisions
- **FastAPI**, async endpoints. Blocking work (pypdf parsing) runs in a thread (`asyncio.to_thread`) so it doesn't block the event loop.
- **SQLModel** models on an async SQLAlchemy engine (`asyncpg` driver; `sqlalchemy[asyncio]` is listed explicitly because SQLAlchemy 2.1 no longer installs `greenlet` by default). Tables are created with `SQLModel.metadata.create_all()` at startup (after `CREATE EXTENSION IF NOT EXISTS vector`). No Alembic yet.
- **Postgres + pgvector** via `docker-compose.yml` in this folder (image `pgvector/pgvector:pg17`, Compose project `manualbuddy`, volume `manualbuddy_pgdata`). Exposed on host port **5433**, because 5432 is taken by a local Postgres on this machine.
- **pypdf** (with the `crypto` extra) for text extraction. Some PDFs are AES-"encrypted" only to block copying, and reading those needs `cryptography`. No OCR needed: all contracts are text-based PDFs. Scanned PDFs without a text layer are rejected with a clear error.
- **PDF check**: filename must end in `.pdf` AND the file must contain the `%PDF-` header in its first 1 KB. Files pypdf can't open are rejected with 400.
- **Ollama** runs locally on the host (not in Docker) and handles both embeddings and chat, via the official `ollama` package (`AsyncClient`).
  - Default embedding model: `bge-m3` (1024 dims, multilingual, because contracts are mostly German, sometimes English). bge-m3 needs no query/passage prefixes.
  - Default chat model: `llama3.2:3b`. You can switch to a bigger one in `.env`.
  - If Ollama can't be reached or a model isn't pulled, the API returns **503** with a readable `detail`, e.g. `"Model 'bge-m3' not found in Ollama. Run: ollama pull bge-m3"`.
- **pgvector column dimension comes from config** (`EMBEDDING_DIM`).
  ⚠️ **Changing the embedding model (or its dimension) means dropping the tables and re-uploading all documents.** Vectors from different models aren't comparable, and `create_all()` doesn't alter existing columns.
- **Chunking** (`app/chunking.py`, returns `TextChunk` DTOs): per page, ~500 chars with ~50 overlap, never crossing page boundaries (so every chunk has exactly one page number to cite). Cuts land on spaces so words stay intact. Text is cleaned first: Unicode NFKC (turns ligatures like `ﬁ` back into `fi`), whitespace collapsed to single spaces, NUL chars removed. Pages without text produce no chunks but still count in `page_count`.
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
│   ├── models.py          # SQLModel table models only (table=True): Document, Chunk
│   ├── schemas.py         # API request/response schemas (DocumentRead, AskRequest, AskResponse, SourceRead, …)
│   ├── dtos.py            # internal dataclasses passed between functions (TextChunk, …)
│   ├── chunking.py        # pure chunking function (easy to test)
│   └── llm.py             # Ollama embed/chat calls + error translation
└── tests/
    ├── test_chunking.py
    └── test_endpoints.py
```

**Rule: three kinds of data classes, three files, never mixed.**
| File | What goes in it | Base |
|---|---|---|
| `models.py` | Database tables | `SQLModel` with `table=True` |
| `schemas.py` | API request/response bodies (`*Read`, `*Request`, `*Response`, …); they appear in `/docs` | `SQLModel` / Pydantic, no `table=True` |
| `dtos.py` | Internal data passed between functions (e.g. `TextChunk` from chunking); never exposed via the API, never stored | `@dataclass` |

New classes in later steps follow the same split. Import tables from `app.models`, schemas from `app.schemas` and DTOs from `app.dtos`.

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

### ✅ `POST /documents`: upload a PDF
- Request: `multipart/form-data` with a field `file` (PDF).
  `curl -F "file=@mietvertrag.pdf" http://localhost:8000/documents`
- `201 Created`:
  ```json
  {"id": 1, "filename": "mietvertrag.pdf", "uploaded_at": "2026-11-24T14:00:00Z", "page_count": 12, "chunk_count": 60}
  ```
- `400` not a PDF / unreadable PDF · `422` PDF has no extractable text (e.g. scanned) · `503` Ollama unavailable / model missing (from step 3)

### ✅ `GET /documents`: list documents
- `200 OK` (newest first):
  ```json
  [{"id": 1, "filename": "mietvertrag.pdf", "uploaded_at": "2026-11-24T14:00:00Z", "page_count": 12, "chunk_count": 60}]
  ```

### ✅ `DELETE /documents/{id}`: delete a document and its chunks
- `204 No Content` · `404` unknown id

### ⏳ `POST /ask`: ask a question
- Request:
  ```json
  {"question": "Wie lange ist die Kündigungsfrist?", "document_ids": [1, 2]}
  ```
  `document_ids` is optional (omit or `null` = search all documents). `question` must be non-empty.
- `200 OK`:
  ```json
  {
    "answer": "Die Kündigungsfrist beträgt drei Monate zum Monatsende. § 4 Abs. 2: „Das Mietverhältnis kann … mit einer Frist von drei Monaten gekündigt werden.“ [1]",
    "sources": [
      {"document_id": 1, "filename": "mietvertrag.pdf", "page_number": 3, "text_snippet": "§ 4 Kündigung (1) … (2) Das Mietverhältnis kann …"}
    ]
  }
  ```
  `sources` is ordered by relevance (max 5). In step 4 `answer` is `null` (retrieval only).
- **Answer rules (system prompt, step 5)**. The chat model must:
  1. Answer in the language of the question (German question → German answer, English → English).
  2. Answer only from the provided sources, never from general knowledge.
  3. Quote the relevant clause word for word (with its § / section number if present) and cite it as `[n]`, where `n` is the source's position in `sources` (1-based).
  4. If the answer isn't in the documents, say so clearly (e.g. „Dazu steht in den Dokumenten nichts.“) instead of guessing.
  5. Not give legal advice: explain what the contract says, don't assess validity or recommend what to do. Suggest asking a lawyer or consumer advice centre (Verbraucherzentrale) when the question goes beyond what the text says.
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
- [x] 2. `POST /documents`: upload, text extraction, chunking (no embeddings yet), plus `GET /documents` and `DELETE /documents/{id}`
- [ ] 3. Embeddings with Ollama: store a vector for every chunk
- [ ] 4. `POST /ask` returning only the retrieved chunks (no LLM yet) to check retrieval quality
- [ ] 5. Add the Ollama chat call to `/ask` (system prompt follows the answer rules under `POST /ask`)
- [ ] 6. Tests for the chunking logic and the endpoints (Ollama mocked)
