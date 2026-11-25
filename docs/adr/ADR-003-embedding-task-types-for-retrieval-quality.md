# ADR-003: Embedding Task Types for Retrieval Quality

> **Rule of thumb:** Index chunks and summaries with `RETRIEVAL_DOCUMENT`, embed search queries with `RETRIEVAL_QUERY`; always pass `task_type`.

**Date:** 2026-03-07 | **Status:** Accepted

**Context:** Google Gemini and OpenAI support task-type hints in embedding calls (`RETRIEVAL_DOCUMENT` vs. `RETRIEVAL_QUERY`). Using the same task type for both indexing and querying degrades retrieval quality.

**Decision:** Use `RETRIEVAL_DOCUMENT` for indexing chunks and summaries; use `RETRIEVAL_QUERY` for query embeddings at search time.

**Consequences:** Embedding calls must pass the correct task type. The `ai_service.py` embedding methods accept a `task_type` parameter.
