# ADR-008: Cost-Aware AI Instrumentation

> **Rule of thumb:** Every AI call logs its tokens to `ai_token_usage_logs` through `AnalyticsService.log_token_usage` (fallback: provider `count_tokens`); embedding tokens count as the session's prompt tokens.

**Date:** 2026-03-20 | **Status:** Accepted

**Context:** AI models (Gemini, OpenAI) charge per token. Without tracking, and with multi-tenancy, it is impossible to know which companies are consuming the most resources or to set billing limits.

**Decision:**
- Implement a unified `log_token_usage` method in `AnalyticsService`.
- Capture `usage_metadata` from AI provider streams whenever possible.
- Implement a "fallback" token counting mechanism using native provider `count_tokens` APIs when streams are interrupted or metadata is unavailable.
- Consolidate embedding tokens (from RAG/Discovery queries) into the `prompt_tokens` count of the corresponding session log for unified cost analysis.
- Store usage in an append-only `ai_token_usage_logs` table.
- Aggregate usage via a Postgres RPC `get_monthly_token_usage` for frontend visualization.

**Consequences:** Enables precise cost auditing per company. Adds slight overhead (extra DB insert per interaction). Fallback counting ensures near-100% accuracy even during network failures.
