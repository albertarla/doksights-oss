# AI Token Quota Enforcement
**Status:** Stable
**Last Updated:** 2026-04-06
**Related ADR:** N/A

## Objective
To implement a centralized, synchronous AI token usage enforcement system that blocks AI requests once a company's monthly license limit is reached. The goal is to enforce this limit across all AI-driven services (chat, discovery, indexing, and classification), provide user-friendly error feedback, and expose token usage metrics to both administrators and end-users.

## User Stories
- As a Super Admin, I want to configure the maximum monthly AI tokens for each license tier.
- As a Company Admin, I want to see my organization's AI token usage relative to the monthly quota on the Dashboard and Analytics pages.
- As an End User, I want to be clearly informed when our AI token limit has been exhausted so I know why AI features are disabled.
- As a System Administrator, I want the token limit enforcement to be robust across all entry points (Chat, Search Discovery, Internal RAG indexing, Category Classification) to prevent abuse.

## Functional Requirements
- **License Configuration:** Super Admins can set `max_ai_tokens` on individual licenses via the Super Admin Dashboard. Leaving it as NULL means unlimited tokens.
- **Quota Checking:** Before any backend AI requests are sent to providers, a synchronous check retrieves the company's token usage for the current sliding window.
- **Fail-Open Mechanics:** If token usage cannot be successfully retrieved, defaults to allowing the transaction.
- **API Gateways:** Streaming and non-streaming HTTP endpoints must respond immediately with a 402 Payment Required or SSE error event (`token_quota_exceeded`) when limits are breached.
- **Background Processes:** RAG indexing and automated classification smoothly skip processing and record a failure status if limits are breached.

### AI Token Tracking
- **Rollup/Reset:** The system checks token limits per calendar month (e.g., reset day starts on the 1st of every month).
- **Token Consolidation**: The token quota sums all token values (`prompt_tokens`, `completion_tokens`, `embedding_tokens`) from the `ai_token_usage_logs`.
- **Validation RPC:** Usage is queried via `get_current_period_token_usage` RPC inside Postgres for speed and accuracy.

## API Surface

_No specific new endpoints exclusively for checking token quota, but all AI endpoints check this validation before yielding. Impacted endpoints include:_

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| POST | /api/v1/chat/ | JWT / Public | Intercepted with 402 if quota is exceeded. |
| POST | /api/v1/chat/stream | JWT / Public | Yields `{"error": "token_quota_exceeded"}` on limit reached. |
| POST | /api/v1/discovery/ | JWT / Public | Yields `{"error": "token_quota_exceeded"}` on limit reached. |

## Data Model

- **Table `licenses`:** Added `max_ai_tokens` (Integer) nullable column to enforce strict quota per company basis.
- **Table `ai_token_usage_logs`:** Aggregated dynamically per-company up to the start of the current month to compute usage against `licenses.max_ai_tokens`.

## Acceptance Criteria
- [x] Setting a lower threshold than current usage causes subsequent AI requests across chat to immediately fail.
- [x] Quota widget visibly reflects UI usage on `/dashboard`.
- [x] Quota visualization is fully displayed on `/analytics` inside the Token Usage tab.
- [x] Chat interface correctly highlights limit exceeded warning to frontend users.
