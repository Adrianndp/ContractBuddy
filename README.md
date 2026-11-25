# ContractBuddy
<img width="3734" height="1982" alt="Screenshot From 2026-11-25 22-06-44" src="https://github.com/user-attachments/assets/393fd791-9ff4-41fb-9e80-4043da929bfb" />

Ask questions about your own contracts — rental, phone, insurance, employment — and get answers that quote the relevant clause and cite the document and page.

ContractBuddy is a small **Retrieval-Augmented Generation (RAG)** app that runs **entirely on your machine**: PDF parsing, embeddings, vector search and the language model. Contracts contain personal data (names, addresses, IBANs, salaries), so no document text or question ever leaves the computer.

```
You:   Wie lang ist meine Kündigungsfrist?
Buddy: Nach Ablauf des Kündigungsverzichts beträgt die Frist drei Monate:
       „Nach Ablauf des Kündigungsverzichts kann die Mieterin das Mietverhältnis
       mit einer Frist von drei Monaten kündigen.“ (§ 7 Abs. 2) [1]

       [1] mietvertrag.pdf, page 2 · relevance ████████░░
```

<!-- Add a screenshot or GIF of the UI here: ![ContractBuddy](docs/screenshot.png) -->

## Features

- **Upload PDF contracts** – text is extracted page by page, cleaned, split into chunks and embedded
- **Ask in German or English** – answers come in the language of the question
- **Sources for every answer** – file name, page, the exact text snippet and its similarity score
- **Search all contracts or only selected ones**
- **Inspect the chunks** of each document, to see what the retriever actually works with
- **Health indicator** for the database and the model server
- **100 % local** – Postgres, Ollama and the app run in Docker; published ports are bound to `127.0.0.1` only

## How it works

```mermaid
flowchart LR
    subgraph Upload
        A[PDF] --> B[Extract text per page<br/>pypdf]
        B --> C[Clean + chunk<br/>~500 chars, 50 overlap]
        C --> D[Embed<br/>bge-m3 · 1024 dims]
        D --> E[(Postgres + pgvector)]
    end
    subgraph Ask
        Q[Question] --> QE[Embed question<br/>bge-m3]
        QE --> R[Top 5 chunks<br/>cosine distance]
        E --> R
        R --> P[Prompt: rules + numbered sources + question]
        P --> L[LLM<br/>llama3.2:3b]
        L --> ANS[Answer + sources]
    end
```

1. **Ingestion** – `pypdf` extracts the text of each page. The text is normalized (Unicode NFKC, whitespace, and a fix for broken ligatures that Word-exported PDFs often contain, e.g. `verp昀氀ichtet` → `verpflichtet`). Each page is split into ~500-character chunks with 50 characters overlap; chunks never cross a page boundary, so every chunk has exactly one page number to cite.
2. **Embedding** – every chunk is turned into a 1024-dimensional vector with `bge-m3` (multilingual, so German contracts and English questions still match) and stored in Postgres with **pgvector**. Upload is all-or-nothing: if embedding fails, nothing is stored.
3. **Retrieval** – the question is embedded with the same model, and the 5 closest chunks by cosine distance (`<=>`) are fetched, optionally filtered to the selected documents.
4. **Generation** – the chunks are passed to the chat model as numbered sources together with a system prompt: answer only from the sources, cite them as `[n]`, quote the key clause, name the contract when sources come from several, say clearly when the answer isn't there, and give no legal advice.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.14, **FastAPI** (async), SQLModel / SQLAlchemy (asyncpg), pydantic-settings |
| Vector store | **PostgreSQL 17 + pgvector** |
| Models | **Ollama** – `bge-m3` (embeddings), `llama3.2:3b` (chat), both configurable |
| PDF | pypdf |
| Frontend | React 19, TypeScript, TanStack Start (SPA mode), Tailwind CSS v4, shadcn/ui |
| Infrastructure | Docker Compose (db, ollama, backend, nginx frontend), optional NVIDIA GPU override |
| Tests | pytest (backend), Vitest (frontend) |

## Quick start (Docker)

Requirements: Docker with Docker Compose. Nothing else – Ollama runs in a container too.

```bash
git clone https://github.com/Adrianndp/ContractBuddy.git
cd ContractBuddy
docker compose up -d --build
```

Open **http://localhost:8080**. API docs (Swagger) are at **http://localhost:8000/docs**.

The first start downloads the models (~3 GB) into a Docker volume, so it takes a while. Follow the progress with:

```bash
docker compose logs -f ollama-init
```

Later starts reuse the downloaded models and work offline.

**GPU (optional):** with an NVIDIA GPU and the NVIDIA Container Toolkit installed, copy `.env.example` to `.env` and make sure `COMPOSE_FILE=docker-compose.yml:docker-compose.gpu.yml` is uncommented. Answers get much faster.

```bash
docker compose down        # stop, keep data and models
docker compose down -v     # stop and delete ALL data and models
```

## Local development

Run only the database in Docker and the rest on the host:

```bash
# Database
docker compose up -d db

# Ollama on the host
ollama pull bge-m3
ollama pull llama3.2:3b

# Config (one file for everything, first time only)
cp .env.example .env

# Backend → http://localhost:8000/docs
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload

# Frontend → http://localhost:8080  (needs npm >= 11)
cd frontend
npm install
npm run dev
```

Tests:

```bash
cd backend && pytest
cd frontend && npm test
```

## Configuration

All settings live in **one** `.env` in the repo root (template: `.env.example`). Docker Compose, the backend and the frontend build all read it:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://manualbuddy:manualbuddy@localhost:5433/manualbuddy` | Postgres connection (Compose overrides it) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server (Compose overrides it with `http://ollama:11434`) |
| `EMBEDDING_MODEL` | `bge-m3` | Embedding model |
| `EMBEDDING_DIM` | `1024` | Vector dimension, must match the embedding model |
| `CHAT_MODEL` | `llama3.2:3b` | Chat model, e.g. `qwen2.5:7b` for better answers |
| `CORS_ORIGINS` | `["http://localhost:8080", "http://127.0.0.1:8080"]` | Allowed frontend origins |

| `VITE_API_URL` | `http://localhost:8000` | Backend URL the browser calls, baked into the frontend at **build time** |
| `COMPOSE_FILE` | (unset = CPU) | `docker-compose.yml:docker-compose.gpu.yml` enables the NVIDIA GPU for Ollama |

> Changing the embedding model means dropping the tables and re-uploading all documents: vectors from different models aren't comparable.

## API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/documents` | Upload a PDF (`multipart/form-data`, field `file`) |
| `GET` | `/documents` | List documents with page and chunk counts |
| `GET` | `/documents/{id}/chunks` | The stored chunks of a document |
| `DELETE` | `/documents/{id}` | Delete a document and its chunks |
| `POST` | `/ask` | `{"question": "...", "document_ids": [1]}` → answer + sources |
| `GET` | `/health` | Status of database and Ollama |

All errors use the shape `{"detail": "<message>"}`. Example:

```bash
curl -F "file=@contract.pdf" http://localhost:8000/documents

curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Wie hoch ist die Kaution?"}'
```

The full contract with request and response shapes is in [`backend/CLAUDE.md`](backend/CLAUDE.md#api-contract).

## Project structure

```
ContractBuddy/
├── docker-compose.yml        # db + ollama + ollama-init + backend + frontend
├── docker-compose.gpu.yml    # optional NVIDIA GPU override
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app and endpoints
│   │   ├── chunking.py       # text cleaning + chunking (pure functions)
│   │   ├── ollama.py         # embed() and chat() via the Ollama client
│   │   ├── prompts.py        # system prompt and source formatting
│   │   ├── models.py         # database tables (SQLModel)
│   │   ├── schemas.py        # API request/response schemas
│   │   ├── dtos.py           # internal dataclasses
│   │   ├── db.py / config.py
│   └── tests/
└── frontend/
    └── src/
        ├── components/contract-workspace.tsx   # the app UI
        └── lib/api.ts                          # all backend calls + types
```

## Design decisions

- **Local models instead of an API** – contracts are personal data. Running embeddings and the LLM through Ollama keeps everything on the machine and costs nothing per request.
- **pgvector instead of a dedicated vector database** – one Postgres for documents, chunks and vectors; joins, filters and transactions come for free.
- **Page-bounded chunks** – a chunk never spans two pages, so every source can be cited with a single page number.
- **Exact search, no ANN index** – sequential cosine search is fast enough up to tens of thousands of chunks and keeps the setup simple.
- **Retrieval before generation** – retrieval was built and checked on its own first (returning only the sources with their distances), so it's always clear whether a bad answer comes from retrieval or from the model.

## Known limitations

- **Small default model.** `llama3.2:3b` runs on any laptop CPU but follows the answer rules only partly: it sometimes skips quotes or `[n]` citations, answers English questions in German, or says nothing was found although the clause is in the sources. A 7B model such as `qwen2.5:7b` (set `CHAT_MODEL`) does noticeably better.
- **Fixed-size chunking.** Chunks are cut by length, so a clause (§) can be split across two chunks. Clause-aware chunking is the next planned improvement.
- **Text-based PDFs only.** Scanned PDFs without a text layer are rejected; there's no OCR.
- **No date reasoning.** Questions like "what's my rent *now*" with a stepped rent need the model to compare dates, which small models get wrong.
- **Single user, no authentication.** Everyone with access to the app sees all documents. It's meant to run on your own machine, not on a public server.

## Roadmap

- [ ] Clause-aware chunking (split by § / section)
- [ ] Hybrid search (BM25 + vectors) for exact terms like "Kündigungsfrist"
- [ ] Retrieval evaluation: a fixed set of questions with expected pages and a hit-rate score
- [ ] Streaming answers
- [ ] Endpoint tests with mocked Ollama

## Notes

This is a learning project for building a RAG pipeline end to end. The frontend was initially generated with Lovable and then cleaned up and maintained in this repo. The app explains what a contract says; it is **not legal advice**.
