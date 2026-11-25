# RAG Pipeline
**Status:** Stable
**Last Updated:** 2026-03-07
**Related ADR:** ADR-002, ADR-003

## Objective
Extract text from uploaded PDF manuals, split it into semantic chunks, generate vector embeddings, and store them for efficient semantic search. Also generate a plain-text summary and its embedding for use by the Discovery feature.

## User Stories
- As a user, I want my uploaded PDF to be automatically indexed, so that AI chat answers are accurate.
- As a system, I want each manual to have a summary embedding, so that Discovery can recommend it by semantic similarity.

## Functional Requirements
- Triggered by: `POST /api/v1/manuals/{id}/index` (requires JWT).
- Sets `rag_status = 'processing'` during indexing, `'completed'` on success, `'failed'` on error (with `rag_error` text).
- **PDF extraction:** Uses `pypdf`. Raw text is extracted per page and normalized (whitespace, control characters).
- **Chunking:** Configurable via env variables:
  - `RAG_CHUNK_SIZE` (default: `1500` chars)
  - `RAG_CHUNK_OVERLAP` (default: `200` chars)
  - Each chunk stores a `chunk_index` and `metadata` JSONB (e.g., page reference).
- **Embedding generation:**
  - Chunk embeddings: task type `RETRIEVAL_DOCUMENT`, model from `EMBEDDING_MODEL` env var.
  - Summary embedding: task type `RETRIEVAL_DOCUMENT`.
  - Dimension: `1536` (standardized via `ADR-002`).
  - Embedding dimension is validated before storage to prevent dimension mismatch.
- **Summary generation:** First `RAG_MAX_CONTEXT_CHARS` (default: `8000`) chars of extracted text are sent to the LLM to produce a one-paragraph summary.
- **Storage:** Chunks written to `manual_chunks` table; summary and `summary_embedding` written to `manuals` table.
- **Semantic search** at query time: `match_manual_chunks` RPC uses cosine similarity with HNSW index. `RAG_TOP_K` chunks returned (default: 5).

## API Surface

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| POST | `/api/v1/manuals/{id}/index` | JWT | Trigger RAG indexing for a manual |
| GET | `/api/v1/manuals/` | JWT | List manuals with `rag_status` |
| GET | `/api/v1/manuals/{id}` | JWT | Get manual details including `rag_status` |

## Data Model

- **Table `manuals`:** Written: `extraction_status`, `rag_status`, `rag_error`, `extracted_text`, `summary`, `summary_embedding VECTOR(1536)`.
- **Table `manual_chunks`:** Written per chunk: `manual_id`, `chunk_index`, `content`, `embedding VECTOR(1536)`, `metadata JSONB`.
- **Indexes:** `idx_manual_chunks_embedding_hnsw` (HNSW, cosine) — used for semantic search. `idx_manuals_summary_embedding_hnsw` (HNSW, cosine) — used for discovery.

## Acceptance Criteria
- [ ] Indexing a manual sets `rag_status = 'processing'` immediately.
- [ ] Successful indexing sets `rag_status = 'completed'` and stores chunks.
- [ ] A failed extraction sets `rag_status = 'failed'` and stores `rag_error`.
- [ ] All embeddings are exactly 1536 dimensions; mismatched embeddings are rejected.
- [ ] `manual_chunks` are deleted when the manual is deleted (ON DELETE CASCADE).
- [ ] `match_manual_chunks` returns top-K chunks by cosine similarity for a given query embedding.
