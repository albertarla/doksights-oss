# AI Chat
**Status:** Stable
**Last Updated:** 2026-03-28
**Related ADR:** ADR-009

## Objective
Allow users (authenticated or public via a portal) to ask natural language questions about one or more manuals. Answers are grounded in the manual's content via RAG and streamed in real-time.
- Both chats operate seamlessly across user roles and public scopes.
- All chats are currently zero-retention from the point of view of the LLM pipeline, however anonymously aggregated records are persisted in `ai_chat_sessions` and `ai_chat_messages` for company-scoped product feedback analysis.

## Security & Scoping
- Both endpoints return SSE (`text/event-stream`) formatting strings starting with `data: ` and ending with `\n\n`.
- The `session_id` payload field is passed to asynchronously log chat contexts via `analytics_service`.

## User Stories
- As an authenticated user, I want to ask questions about a manual I'm reading, so that I get instant answers without reading the whole document.
- As a public portal visitor, I want to ask questions about a company's public manual, so that I can self-serve troubleshooting.
- As a user, I want answers streamed word-by-word, so that I see feedback immediately.

## Functional Requirements
- **Streaming endpoint** (`POST /api/v1/chat/stream`): Returns a Server-Sent Events (SSE) stream.
  - Supports three access modes:
    1. **Authenticated + `manual_id` list** — internal dashboard/viewer usage.
    2. **Public + `link_id`** — portal viewers accessing public manuals by link.
    3. **Public + `company_slug` + `manual_id` list** — portal AI chat for public manuals.
  - The backend fetches the manual content (RAG chunks), builds a system prompt, and calls the AI provider.
  - **Rate limiting**: configurable `RATE_LIMIT_REQUESTS` per `RATE_LIMIT_WINDOW_SECONDS` per user/IP.
- **Non-streaming endpoint** (`POST /api/v1/chat/message`): Returns a JSON object with the full response. Useful for testing.
- Context is built from the top-K most semantically similar chunks retrieved by `match_manual_chunks` RPC.
- System prompt includes: company context, manual title/description, and the RAG context chunks.
- Markdown responses are rendered in the `AIChatPanel` UI component using a markdown renderer.
- AI provider is selected based on the `AI_PROVIDER` env variable (`openai` | `google`).
- **Mobile Responsiveness**:
  - Chat panels use a mobile-first responsive design.
  - On viewports < 768px (`useIsMobile`), the chat panel transitions from a resizable sidebar to a full-screen absolute overlay.
  - **State Preservation**: To prevent data loss when switching between the document and the chat on mobile, the chat component remains mounted in the DOM. Visibility is toggled via CSS (`hidden` class) rather than conditional rendering.

## API Surface

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| POST | `/api/v1/chat/stream` | Optional JWT | Stream AI response for the given manuals and query |
| POST | `/api/v1/chat/message` | Optional JWT | Non-streaming AI response (JSON) |

**Request body:**
```json
{
  "messages": [{"role": "user", "content": "How do I reset the device?"}],
  "manual_ids": ["uuid1", "uuid2"],
  "company_slug": "acme-corp"
}
```

## Data Model

- **Table `manual_chunks`:** Read by `match_manual_chunks` RPC to find relevant content.
- **Table `manuals`:** Read for title, description, and access validation.
- **Table `companies`:** Read for name and `portal_enabled` (for public access).

## Acceptance Criteria
- [ ] Authenticated user receives a streamed response grounded in manual chunks.
- [ ] Public user with a valid `company_slug` and public `manual_id` list receives a response.
- [ ] Rate limit is enforced; excess requests return HTTP 429.
- [ ] No access granted to private manuals without authentication.
- [ ] Markdown in AI responses renders correctly in `AIChatPanel`.
