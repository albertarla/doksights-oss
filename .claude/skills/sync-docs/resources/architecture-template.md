# System Architecture: DokSights

**Last Updated:** YYYY-MM-DD

---

## 1. High-Level Overview
[Brief description of the system's purpose and primary data flow]

---

## 2. Technology Stack

| Layer | Technology | Version |
| :--- | :--- | :--- |
| Frontend | React + TypeScript (Vite) | 18 / 5 |
| UI Library | shadcn/ui + Tailwind CSS | - |
| Backend | Python FastAPI | 0.1.0 |
| Database | Supabase (PostgreSQL + pgvector) | - |
| AI / LLM | Google Gemini / OpenAI | - |
| Embeddings | Google `text-embedding-004` | 1536-dim |
| Hosting | Static frontend (Vite build) + Docker (backend) | - |

---

## 3. Component Responsibilities

- **Frontend (`src/`):** React SPA. Handles authentication, multi-tenant portals, manual uploads, analytics, and AI chat UI.
- **Backend (`app/`):** Python FastAPI server. Manages AI chat, RAG indexing, and manual metadata retrieval. Runs inside Docker.
- **AI Service (`ai_service.py`):** Unified abstraction over multiple AI providers (Google, OpenAI). Handles chat, streaming, and embeddings.
- **RAG Service (`rag_service.py`):** PDF extraction, text chunking, embedding, vector storage in Supabase, and semantic retrieval.
- **Supabase Service (`supabase_service.py`):** Data access layer for all Supabase interactions (manuals, chunks, users, companies).
- **Supabase (DB + Auth + Storage):** Stores all data, handles JWT auth, stores PDF files, and executes vector similarity searches via `pgvector`.

---

## 4. Data Flow

[Describe the end-to-end flow here. Example for RAG indexing:]

1. **Upload:** User uploads a PDF → stored in Supabase Storage.
2. **Indexing trigger:** Backend downloads PDF → extracts text page-by-page.
3. **Chunking:** Text is split into overlapping chunks.
4. **Embedding:** Each chunk is embedded via Google `text-embedding-004`.
5. **Storage:** Chunks + embeddings stored in `manual_chunks` table with `pgvector` column.
6. **Logging:** AI token usage for indexing is logged to `ai_token_usage_logs`.
7. **Query:** User asks a question → query is embedded (track tokens) → vector similarity search → top-K chunks retrieved.
8. **Response:** Relevant chunks injected into system prompt → LLM streams answer → consolidate query + response tokens → log to `ai_token_usage_logs`.

---

## 5. Infrastructure & Deployment

[Describe where and how the product is hosted, Docker setup, CI/CD]

---

## 6. Architecture Decision Records (ADR)

ADRs live in [`docs/adr/`](./adr/_index.md), one file per decision.
