# Manual Discovery
**Status:** Stable
**Last Updated:** 2026-03-28
**Related ADR:** ADR-009

## Objective
Help users who don't know which manual they need by providing an AI-powered recommendation system. Users describe their problem in natural language, and the system returns a ranked list of relevant manuals.

## User Stories
- As a portal visitor, I want to describe my problem to an AI and receive relevant manual suggestions, so that I can quickly find the right document.
- As an authenticated admin, I want to use the same discovery feature internally.

## Functional Requirements
- Endpoint: `POST /api/v1/chat/discover`
- Access: No authentication required for public portals. Authenticated users may also call it.
- Request includes: `company_slug` (required) and a user query.
- **Flow:**
  1. Embed the user's query using the AI embedding service with task type `RETRIEVAL_QUERY`.
  2. Call the appropriate RPC function:
     - Authenticated or `company_id` known: `match_manual_summaries_by_company`.
     - Public access: `match_public_manual_summaries_by_company`.
  3. Top-K most semantically similar manual summaries are retrieved (cosine similarity on `summary_embedding`).
  4. A system prompt instructs the LLM to recommend manuals from the list based on the user's query.
  5. The LLM response is returned as JSON (non-streaming).
- Similarity search on `summary_embedding VECTOR(1536)` using HNSW index (`idx_manuals_summary_embedding_hnsw`).
- The `DiscoveryChat` component in `CompanyPortal.tsx` passes `company_slug` automatically from the URL.
- **Mobile Responsiveness**:
  - The discovery sidebar becomes a full-screen absolute overlay on mobile viewports (< 768px).
  - Toggling discovery chat preserves the user's conversational history by using CSS visibility (`hidden`) instead of remounting the component.

## API Surface

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| POST | `/api/v1/chat/discover` | Optional JWT | Discover relevant manuals by natural language query |

**Request body:**
```json
{
  "query": "My device won't turn on",
  "company_slug": "acme-corp"
}
```

## Data Model

- **Table `manuals`:** `summary` (text), `summary_embedding VECTOR(1536)` — used by RPC for semantic similarity.
- **RPC `match_manual_summaries_by_company`:** Cosine similarity on `summary_embedding` for all company manuals.
- **RPC `match_public_manual_summaries_by_company`:** Same, but filtered to `is_public = true`.

## Acceptance Criteria
- [ ] A public portal user can send a query and receive manual recommendations by name.
- [ ] Only public manuals are returned for unauthenticated requests.
- [ ] Authenticated users can discover all company manuals.
- [ ] If no summaries exist for the company, the endpoint returns an empty recommendation gracefully.
