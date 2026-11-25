# ADR-010: Asynchronous AI Chat Classification Pipeline

> **Rule of thumb:** Chat classification runs only in the background job (APScheduler, `CLASSIFICATION_ENABLED`) on sessions idle >= 2 h, using a cheaper model and `cron_locks`; never classify inside a chat request.

**Date:** 2026-03-29 | **Status:** Accepted

**Context:** The raw list of thousands of chat logs is difficult for portal admins to parse. We need an automated way to categorize feedback (Bug, Missing Functionality, etc.) and cluster similar topics (Themes) so admins can see trends at a glance. We cannot do this synchronously during the chat itself as it adds latency and token cost to every user turn, and we only want to classify *completed* sessions.

**Decision:**
- Implement an asynchronous pipeline (`ClassificationService`) triggered by an APScheduler background job running every N minutes.
- Sessions are considered ready for classification only after they have been idle (inactive) for at least 2 hours, detected via the `updated_at` column.
- Pipeline executes a 3-pass process for each qualifying session:
  1. **LLM Classification**: Analyzes the session transcript to extract a Category Label and Conclusion Summary using a high-efficiency model (e.g., `gemini-2.5-flash`) isolated from the main RAG model.
  2. **Semantic Matching**: Embeds the Conclusion and matches it against `ai_chat_themes` using HNSW vector search (`match_chat_themes` RPC). Assigns to the closest theme or creates a new one.
  3. **Milestone Re-titling**: Periodically re-evaluates the theme's title using a sample of its sessions when it hits configurable milestones (e.g., 5, 15, 50 sessions) to improve label accuracy.
- Manage concurrency across multiple Uvicorn workers using a dedicated PostgreSQL table (`cron_locks`) with atomic UPSERT RPCs. This replaces `pg_try_advisory_xact_lock()` because PostgREST's connection pooling and immediate transaction completion makes transaction-level advisory locks ineffective over REST.
- **Auto-Reopen**: If a user sends a new message to a previously classified session, it is automatically re-opened (classification fields cleared) and will be re-analyzed after a fresh 2-hour idle period.


**Consequences:**
- Introduces `APScheduler` dependency.
- Optimizes API latency by offloading analysis.
- Optimizes LLM token cost by using a faster/cheaper model for internal classification metadata.
- Prevents database deadlocks and duplicated work through a strict table-based locking mechanism (`acquire_cron_lock`) without needing external distributed caching systems like Redis.
