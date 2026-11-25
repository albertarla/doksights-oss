# Analytics
**Status:** Stable
**Last Updated:** 2026-04-23
**Related ADR:** ADR-005, ADR-010

## Objective
Give company administrators real-time visibility into how visitors engage with their public portal and individual manuals, enabling data-driven decisions about content.

## User Stories
- As a company admin, I want to see daily portal view counts over time, so that I understand traffic trends.
- As a company admin, I want to see which manuals are most viewed, so that I know what content is most valuable.
- As a company admin, I want to see average reading time and pages viewed, so that I can assess engagement depth.
- As a company admin, I want to monitor AI token usage across different features (Chat, Discovery, Indexing) to manage operational costs.
- As a company admin, I want the data to update in real-time as new visitors arrive.

## Functional Requirements
- **Traffic Tracking**: Record distinct sessions per manual using a privacy-first identifier (IP/UA hash).
- **Time on Page**: Calculate the time a user spends reading the manual before dropping off or finishing.
- **Engagement Completion**: Log the percentage of pages viewed relative to the total pages of the manual.
- **AI Insights Framework**: Anonymously log conversation sessions (prompts & AI responses) through ephemeral `session_id` tags to discover user needs.
- **AI Token Tracking**: Log detailed prompt and completion token counts for every AI interaction (Manual Indexing, Manual Chat, Discovery Chat). Embedding costs from RAG/Discovery query lookups are consolidated into the session's prompt token count for unified cost analysis.
- **AI Chat Insights Classification**: An asynchronous pipeline that classifies conversation sessions (after 2 hours of inactivity) into actionable categories (e.g. Bug, Fix Request, Usability Issue).
- **Semantic Theme Clustering**: Groups similar classified sessions into "themes" using HNSW vector embeddings and automatically retitles them based on chat LLM summarization.
- **Real-Time Dashboards**: Provide a UI for company admins to visualize portal traffic over time, top manuals, and AI token consumption history.
- Requires the `page.analytics` permission. Unauthorized users are redirected to `/dashboard`.
- Data is **scoped to the authenticated user's company** by `company_id`.
- Filterable by **manual** (single or all) and by **date range** (7 / 14 / 30 / 90 days / **All time**).
  - When **All time** is selected, no date filter is applied to the Supabase queries; chart intervals are derived from the earliest fetched data point (fallback: 365 days).
- Key metrics displayed:
  - **Unique Visitors** — distinct daily visitors (computed via `hashed_identifier`).
  - **Total Views** — total view events in the selected period.
  - **Avg. Reading Time** — average `reading_duration_seconds` per session.
  - **Avg. Pages Viewed** — average `pages_viewed` per session.
- Charts rendered with `recharts`:
  - **Portal Traffic** — area chart of daily view counts.
  - **Manual Performance** — horizontal bar chart of top-5 manuals by views.
  - **View Distribution** — donut pie chart of view share per manual.
  - **Session Classification** — donut pie chart of AI sessions grouped by feedback category.
  - **Category Trends** — stacked bar chart of session categories over time.
  - **Top Themes** — Ranked table of auto-generated semantic topics based on user questions.
  - **AI Token Usage** — stacked bar chart of monthly token consumption segmented by feature (Indexing, Manual Chat, Discovery Chat).
- **Realtime updates** via Supabase Realtime: subscribes to `INSERT` on `manual_views` filtered by `company_id`. The chart refreshes automatically on new events.
- Shows a warning banner when the portal is disabled (no traffic possible).

## API Surface

> Data visualization reads directly from Supabase via the frontend. Tracking is handled securely by the backend API.

| Table / Source / Endpoint | Operation | Description |
| :--- | :--- | :--- |
| `POST /api/v1/analytics/view` | API Endpoint | Captures manual views asynchronously. Hashes the user's IP + a daily salt to create a privacy-preserving `hashed_identifier`. |
| `manual_views` | SELECT | View events for the company, filtered by date range and optionally by manual |
| `manuals` | SELECT | Manual title and public status |
| `ai_chat_sessions`| SELECT | AI chat sessions for the company, filtered by date and manual |
| `ai_chat_messages`| SELECT | Individual messages for a chat session |
| `POST /api/v1/analytics/classify-sessions` | API Endpoint | Manual trigger for the classification pipeline (Superadmin only). |
| `rpc.get_monthly_token_usage` | RPC | Aggregates token usage data grouped by month and feature for the current company |
| `rpc.get_unclassified_sessions` | RPC | Returns sessions (after 2h idle) ready for classification. |
| `rpc.update_session_classification` | RPC | Updates a session with label, conclusion, and optional theme mapping. |
| `rpc.match_chat_themes` | RPC | HNSW vector search to find similar existing themes. |
| `companies` | SELECT | Portal enabled status |
| Supabase Realtime | Subscription | New `manual_views` INSERT events for live refresh |

## Data Model

- **Table `manual_views`:** Core analytics table. Each row is one viewing session with: `manual_id`, `company_id`, `hashed_identifier` (IP hash for daily unique visitors), `viewed_at` (timestamp), `reading_duration_seconds`, `pages_viewed`, `total_pages`, `referrer`, `user_agent`, `country`, `source`. Note: `user_id` was removed to preserve privacy.
- **Table `ai_token_usage_logs`:** Tracks token consumption per AI interaction. Fields: `company_id`, `feature` (type of interaction), `model` (AI model used), `prompt_tokens`, `completion_tokens`, `total_tokens`, `related_id` (session or manual ID), `created_at`.
- **Table `ai_chat_themes`:** Stores semantic clusters of user issues: `label`, `title`, `embedding VECTOR(1536)`, `session_count`, `needs_retitle`.
- **Table `manuals`:** Read for `title`, `is_public`.
- **Table `companies`:** Read for `portal_enabled`.

## Acceptance Criteria
- [ ] Admin with `page.analytics` permission sees the analytics dashboard.
- [ ] Admin without the permission is redirected to `/dashboard` with an error toast.
- [ ] Filtering by a specific manual shows only that manual's view events.
- [ ] Filtering by date range recalculates all metrics and charts.
- [ ] A new view event (portal visit) appears in the chart within seconds via Realtime.
- [ ] When portal is disabled, a warning banner is displayed above the metrics.
- [ ] Admin with `page.analytics` sees three new Classification panels: Session Classification Donut Chart, Category Trends Bar Chart, and Top Themes ranking.
- [ ] Unclassified sessions appear with state-specific badges ("Queued for Analysis", "Active / Waiting", or "Analysis Failed") in the Recent AI Conversations tab.
- [ ] Superadmins see a "Run Analysis Now" button to manually trigger the classification pipeline.
