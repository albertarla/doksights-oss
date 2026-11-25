# ADR-002: Standardized Embedding Dimension (1536)

> **Rule of thumb:** Every embedding (chunks, summaries, chat themes) is 1536-d to fit the pgvector HNSW limit; changing it needs a migration and a full re-index.

**Date:** 2026-03-07 | **Status:** Accepted

**Context:** The original dimension was 3072 (OpenAI text-embedding-3-large), which exceeded the pgvector HNSW index limit of 2000. Dimensions were later tested at 384 (all-minilm-l6-v2) but were insufficient for production quality. An intermediate value of 1536 matches OpenAI text-embedding-3-small and allows HNSW indexing.

**Decision:** Standardize all embedding columns (`manual_chunks.embedding`, `manuals.summary_embedding`) at 1536 dimensions.

**Consequences:** Requires re-indexing when the dimension changes. All providers must produce 1536d vectors or be configured to truncate.
