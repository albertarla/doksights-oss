---
paths:
  - "backend/**"
---

# Backend rules (FastAPI · Python 3.11+)

## Layout

- `app/routers/` holds HTTP endpoints only: parse input, check access, call a service, shape the response. Business
  logic goes in `app/services/`.
- `app/services/supabase_service.py` is the only place that talks to Supabase (tables, RPCs, storage). Add a method
  there instead of calling `get_client()` from a router.
- `app/services/ai_service.py` is the only place that calls an AI provider. Google Gemini is the supported provider;
  don't build on the OpenAI path, and don't add a provider without an ADR.
- Settings come from `app/config.py` (`settings`). New settings get a default there and an entry in `.env.example`.

## Access control (non-negotiable)

- The backend uses the service-role key, which bypasses RLS. Every route that reads or writes tenant data:
  1. authenticates with `Depends(verify_supabase_token)` (or `get_optional_user` for public portal routes), and
  2. checks access before touching data: `supabase_service.get_manual(manual_id, user_id)` (membership, portal user
     or public manual), `_has_company_permission(user_id, company_id, "page.<x>")`, or `is_superadmin(user_id)`.
- Missing or invalid token → 401; authenticated but not allowed → 403; not found or not visible → 404. Don't reveal
  whether a resource exists to someone who can't see it.
- Private portals: anonymous callers must be rejected in chat and discovery (ADR-011).

## AI, RAG and tokens

- Embeddings are 1536-d (ADR-002). Use `RETRIEVAL_DOCUMENT` when indexing and `RETRIEVAL_QUERY` for search (ADR-003).
- Every AI call logs tokens through `AnalyticsService.log_token_usage`; check `ai_service.check_token_quota` before
  starting work that spends tokens (ADR-008).
- Long or periodic AI work runs in the APScheduler job behind `CLASSIFICATION_ENABLED`, never inside a request (ADR-010).

## Tests

- Every new endpoint, service method or branch gets pytest tests in `backend/tests/` (`backend-tests` skill).
- Mock Supabase and the AI provider; tests must not need network, keys or a running database.
- Cover the success path, edge cases (empty, missing, null) and failures (401/403/404, provider errors, quota exceeded).
