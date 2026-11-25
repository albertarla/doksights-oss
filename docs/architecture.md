# Architecture
**Last Updated:** 2026-05-02

## High-Level Overview
DokSights is a multi-tenant SaaS for managing and AI-chatting with PDF product manuals. It consists of a React SPA frontend, a FastAPI backend running in Docker, Supabase for the database and auth, and Supabase Edge Functions for serverless operations. Companies upload PDF manuals, which get RAG-indexed (chunked + embedded), and then exposed on a branded public portal where users can browse and chat with the manuals using AI.

---

## Technology Stack

| Layer | Technology | Notes |
| :--- | :--- | :--- |
| Frontend | React 18 + TypeScript + Vite | SPA, served statically |
| Frontend Testing | Vitest + Playwright | Unit/Component (jsdom) + E2E (Chromium) |
| UI Components | shadcn/ui + Tailwind CSS | Component library |
| Charts | recharts | Used in Analytics page |
| Auth Client | Supabase Auth JS | Session management |
| Backend | FastAPI + Python 3.11 | Runs in Docker |
| Backend Auth | python-jose (HS256/RS256/ES256) | JWT validation |
| Database | PostgreSQL 17 (Supabase) | via supabase-py (async) |
| Vector Search | pgvector extension | HNSW indexes |
| File Storage | Supabase Storage | `manuals` (private PDFs), `web_images` (public), `company-logos` (public) |
| Edge Functions | Supabase Edge Functions (Deno) | `get-company-portal` |
| AI | OpenAI / Google Gemini | Configurable via `AI_PROVIDER`, `GOOGLE_AI_MODEL`, `OPENAI_AI_MODEL` |
| Embeddings | Configurable (1536d) | Configurable via `EMBEDDING_MODEL` |
| PDF Parsing | pypdf | Server-side extraction |
| Notifications | Resend | Email communications for access requests and admin alerts |

---

## Component Responsibilities

| Component | Responsibility |
| :--- | :--- |
| `frontend/src/pages/Dashboard.tsx` | Admin home: portal status, content summary, manual browser (read-only) |
| `frontend/src/pages/ManualsManagement.tsx` | Upload, edit, delete, organize manuals and folders |
| `frontend/src/pages/InternalManualViewer.tsx` | Full PDF viewer with AI chat panel (internal, authenticated) |
| `frontend/src/pages/CompanyPortal.tsx` | Branded portal: browse, search, read manuals, discovery chat; handles PRIVATE_PORTAL redirect and PORTAL_ACCESS_DENIED error |
| `frontend/src/pages/CompanyPortalLogin.tsx` | Login page for private portals; fetches company branding, handles returnTo redirect |
| `frontend/src/pages/PortalEdit.tsx` | Configure portal branding, slug, on/off toggle, public/private mode |
| `frontend/src/components/dashboard/PortalUsersList.tsx` | Manage authorized portal users and pending invitations for private portals |
| `frontend/src/pages/CompanyUsers.tsx` | Invite users, manage permissions, enable/disable members |
| `frontend/src/pages/Analytics.tsx` | Real-time portal traffic charts, manual performance, engagement metrics |
| `backend/app/routers/chat.py` | Stream and non-stream AI chat endpoints |
| `backend/app/routers/manuals.py` | Manual CRUD + RAG indexing trigger |
| `backend/app/routers/discovery.py` | Manual discovery by natural language query |
| `backend/app/routers/portal.py` | Portal management endpoints: `POST /portal/send-invite` sends portal invite emails |
| `backend/app/services/ai_service.py` | Unified AI abstraction (chat + embeddings) for all providers |
| `backend/app/services/rag_service.py` | PDF extraction, chunking, embedding, storage, and semantic search |
| `backend/app/services/notification_service.py` | Unified email and notification wrapper (Resend integration) |
| `backend/app/auth/jwt_handler.py` | JWT verification (HS256 + JWKS-based asymmetric) |
| Supabase Edge Fn `get-company-portal` | Fetch company + public manuals + folders in one call; track views |

---

## Database Schema

### Tables

| Table | Purpose |
| :--- | :--- |
| `auth.users` | Supabase-managed users |
| `profiles` | Thin profile: `id`, `email`, `is_superadmin` (global bypass). Legacy columns removed. |
| `companies` | Multi-tenant company entity: name, `slug` (unique), `portal_enabled`, `portal_privacy` (`public` \| `private`), branding |
| `licenses` | Catalogs plan limits: `name`, `max_manuals`, `max_public_manuals`, `max_users`, `features JSONB` |
| `company_licenses` | Maps `company_id` to `license_id`. `subscription_status` |
| `company_users` | Join table with `role` (`admin` \| `member`) and `status` (`active` \| `invited`). |
| `permissions` | Static lookup: `page.analytics`, `page.users`, `page.portal`, `page.manuals` |
| `company_user_permissions` | Junction: which permissions a `company_user` has |
| `company_invites` | Pending invites: `email`, `token` (UUID), `accepted_at` |
| `company_invite_permissions` | Permissions to grant when an invite is accepted |
| `portal_users` | Authorized portal-only users: `company_id`, `user_id` (FK → `auth.users`), `email`. Unique on `(company_id, user_id)` |
| `portal_invites` | Pending portal email invitations: `company_id`, `email`, `token` (UUID), `expires_at`, `accepted_at`. Consumed by `handle_new_user()` on portal-invite sign-up |
| `folders` | Manual folders per company: `name`, `description`, `display_order` |
| `manuals` | Core content: `title`, `description`, `manual_type` (`pdf` \| `web`), `file_path`, `file_size` (PDF byte size for PDFs; aggregate image size for web manuals), `page_count`, `is_public`, `display_order`, `rag_status`, `summary`, `summary_embedding VECTOR(1536)` |
| `manual_sections` | Content for web manuals: `title`, `content`, `display_order`. Embedded instead of chunked via file parser. |
| `web_manual_images` | Image Library for web manuals: `manual_id` (FK → `manuals`, CASCADE), `storage_path`, `file_name`, `file_size`. Storage files require explicit deletion before DB delete. |
| `manual_chunks` | RAG chunks: `content`, `embedding VECTOR(1536)`, `metadata JSONB`, `chunk_index` |
| `manual_views` | Analytics: per-session view event with `hashed_identifier` (IP hash), `reading_duration_seconds`, `pages_viewed`, `total_pages`, `referrer`, `country`, `source` |
| `ai_chat_sessions` | Analytics: per-session chat log with `manual_id` (nullable), `chat_type` (`standard` \| `discovery`) and classification fields (`label`, `is_finalized`, etc). |
| `ai_chat_themes` | Analytics: semantic clusters representing common questions across the company. |
| `ai_chat_messages` | Analytics: individual chat messages with `role` and `content`. |
| `ai_token_usage_logs` | Infrastructure: tracks prompt/completion tokens per company/feature/model. |

### Vector Indexes (HNSW)

| Index | Table | Column | Used For |
| :--- | :--- | :--- | :--- |
| `idx_manual_chunks_embedding_hnsw` | `manual_chunks` | `embedding` | AI chat semantic search |
| `idx_manuals_summary_embedding_hnsw` | `manuals` | `summary_embedding` | Discovery recommendation |
| `idx_chat_themes_embedding_hnsw` | `ai_chat_themes` | `embedding` | Chat topic similarity clustering |

### Key Database Functions

| Function | Description |
| :--- | :--- |
| `handle_new_user()` | Trigger on `auth.users` insert: (1) company invite → creates profile + company membership + permissions; (2) portal invite → creates profile + `portal_users` row only (no dashboard access); (3) new company → creates profile + company + admin membership |
| `is_company_member(company_id)` | Returns true if current user is an active member |
| `has_company_permission(company_id, key)` | Returns true if current user has a specific permission |
| `get_invite_context(token)` | Returns company invite details including pre-assigned permissions |
| `get_portal_invite_context(token)` | Returns portal invite details (company name, email, expiry) for `Auth.tsx` pre-fill |
| `ensure_company_membership()` | Idempotent function to repair missing company membership |
| `generate_company_slug(name)` | Generates a URL-safe unique slug for a company |
| `is_superadmin(user_id)` | Returns true if the user's `is_superadmin` flag in `profiles` is true |
| `match_manual_chunks(ids, embedding, k)` | Cosine similarity search over chunk embeddings |
| `match_manual_summaries_by_company(...)` | Cosine similarity over summary embeddings for all company manuals |
| `match_public_manual_summaries_by_company(...)` | Same, filtered to `is_public = true` |
| `get_monthly_token_usage(company_id)` | Grouped aggregation of tokens by month and feature for a company |
| `get_current_period_token_usage(company_id, reset_day)` | Computes total token usage for a company within the current billing cycle |

### Row-Level Security (RLS)

All tables have RLS enabled. Key policies:

| Table | Who can read | Who can write |
| :--- | :--- | :--- |
| `companies` | Active members + public (portal-enabled companies) | Members with `page.portal` |
| `manuals` | Active members + public (`is_public = true`, portal-enabled) | Members with `page.manuals` |
| `manual_sections` | Active members + public (if parent manual is public & portal-enabled) | Members with `page.manuals` |
| `folders` | Active members + public (portal-enabled) | Members with `page.manuals` |
| `manual_views` | Members with `page.analytics` | Edge function (public portals only) |
| `company_users` | Own row | Members with `page.users` |
| `company_invites` | Members with `page.users` | Members with `page.users` |
| `portal_users` | Active company members | Active company members (insert direct-add); `handle_new_user` trigger (portal invite sign-up) |
| `portal_invites` | Active company members | Active company members |

---

## Data Flows

### 1. Manual Indexing (RAG Pipeline)
```
Admin uploads PDF or creates Web Manual
→ If PDF: Storage bucket `manuals` -> POST /api/v1/manuals/{id}/index
→ If Web Manual: POST /api/v1/manuals/{id}/index
→ AI Service validates Token Quota (`check_token_quota`) → grace fail if limit reached
→ If PDF: pypdf extracts text → text split into chunks
→ If Web Manual: sections fetched from `manual_sections` → content formatted as chunks
→ OpenAI/Gemini generates embeddings (RETRIEVAL_DOCUMENT, 1536d)
→ Chunks stored in `manual_chunks`
→ LLM generates summary → stored in `manuals.summary`
→ Summary embedded → stored in `manuals.summary_embedding`
→ Log embedding tokens to `ai_token_usage_logs`
→ rag_status = 'completed'
```

### 2. AI Chat (Streaming)
```
User sends message → POST /api/v1/chat/stream (FastAPI)
→ JWT verified (or optional for public access)
→ AI Service validates Token Quota (`check_token_quota`) → 402/SSE error if limit reached
→ Query embedded (RETRIEVAL_QUERY, 1536d)
→ match_manual_chunks RPC → top-K chunks by cosine similarity
→ System prompt built with chunks + manual context
→ AI provider streams response (SSE)
→ Capture `usage_metadata` (tokens) and consolidate embedding tokens into `prompt_tokens`
→ Log consolidated chat tokens to `ai_token_usage_logs`
→ Frontend AIChatPanel renders markdown tokens
```

### 3. Manual Discovery (Public Portal)
```
Portal visitor types query → POST /api/v1/chat/discover
→ company_slug resolves to company_id
→ AI Service validates Token Quota (`check_token_quota`) → limit error if reached
→ Query embedded (RETRIEVAL_QUERY, 1536d) and token count captured
→ match_public_manual_summaries_by_company RPC → top-K summaries
→ LLM recommends manuals from the list
→ Log consolidated tokens (embedding + recommendation) to `ai_token_usage_logs`
→ DiscoveryChat sidebar shows recommendations
```

### 4. Portal Load (Public or Private)
```
Visitor navigates to /company/{slug}
→ Frontend calls get-company-portal Edge Function
  (sends Authorization: Bearer {access_token} if user is logged in)
→ Edge Function checks portal_enabled → error if false
→ If portal_privacy = 'public': fetch and return data (no auth check)
→ If portal_privacy = 'private':
  → No/invalid token → return { error: 'PRIVATE_PORTAL', slug } HTTP 401
    → Frontend redirects to /company/{slug}/login?returnTo={path}
  → Valid token but no portal_users/company_users row → return { error: 'PORTAL_ACCESS_DENIED' } HTTP 403
    → Frontend shows inline "no permission" error (no redirect)
  → Valid token + access → fetch and return data normally
→ Frontend renders branded portal page with search + manuals
→ Frontend asynchronously calls POST /api/v1/analytics/view to record the visit (anonymized)
```

### 4b. Portal Invite Sign-Up
```
Admin invites email → POST /api/v1/portal/send-invite
→ FastAPI verifies JWT (must be active company member)
→ Creates portal_invites row (if not existing user) or direct-inserts into portal_users
→ NotificationService sends branded email via Resend
   with link: /auth?portal_invite={token}&company={slug}
→ Recipient follows link → Auth.tsx shows portal invite banner
→ User signs up → handle_new_user() trigger fires
→ Reads portal_invite_token from raw_user_meta_data
→ Finds matching portal_invites row (not expired, not accepted)
→ Inserts portal_users row; marks invite accepted_at = now()
→ No company_users row created → user has no dashboard access
→ Frontend redirects to /company/{slug}
```

### 5. Tenant Provisioning (Superadmin)
```
Superadmin fills "New Company" form → POST /api/v1/superadmin/companies
→ Backend validates Superadmin JWT
→ Supabase Admin Auth creates auth.users row (initial admin)
→ Inserts `companies` taking the provided name
→ Inserts `company_licenses` assigning the selected license
→ Inserts `company_users` (status = 'active', role = 'admin')
```

### 6. Invite Sign-Up (Join Existing Company)
```
User follows invite link → Supabase Auth sign-up with invite_token in metadata
→ handle_new_user trigger fires
→ Matches invite by token → resolves company_id
→ Inserts company_users for existing company
→ Grants only the invite's permissions
→ Marks invite accepted_at = now()
```

### 7. AI Chat Classification Pipeline
```
APScheduler background job (runs every N minutes)
→ Tries to acquire `pg_try_advisory_xact_lock` for cross-worker safety
→ RPC `get_unclassified_sessions`
→ Validates Token Quota per company (`check_token_quota`) → skips if limit reached
→ Extracts Chat transcript → Sent to Classification LLM (gemini-2.0-flash-lite)
→ Embeds Conclusion summary (RETRIEVAL_DOCUMENT, 1536d)
→ RPC `match_chat_themes` to find existing clusters
→ If none, Insert new theme.
→ RPC `update_session_classification`
```

---

## Infrastructure & Deployment

- **Frontend:** Deployed to **Vercel** (production: custom domain; preview: auto-generated per `develop` push). Static SPA built with `npm run build` (Vite). Local dev via `./frontend/docker_utils/run_docker.sh`. Tested via Docker using `vitest` and `playwright`.
- **Backend:** Deployed to **Railway** (Docker container). Two services: production (tracks `main`) and staging (tracks `develop`). Image defined in `backend/Dockerfile`. Local dev via `./backend/docker_utils/run_docker.sh`.
- **CI/CD:** GitHub Actions — three workflows: `ci.yml` (tests on `develop`/`feature/*` pushes), `deploy.yml` (production deploy on `main` push), `staging.yml` (staging deploy on `develop` push + health smoke test).
- **Database:** Supabase hosted PostgreSQL (eu-central-1).
- **Edge Functions:** Deployed to Supabase. Function: `get-company-portal` (`verify_jwt: false` — public endpoint).
- **Storage:** Supabase Storage — `manuals` (private PDFs, signed URLs), `web_images` (public), `company-logos` (public). *Note: Buckets must be initialized manually or via sync migrations as they are not captured in standard DB pulls.*
- **Environment State:** The application requires seed data in `permissions` (access keys) and `licenses` (tier templates) to function.
- **Realtime:** `manual_views` table subscribed to `supabase_realtime` publication. Frontend listens on `INSERT` events for live analytics refresh.
- **Environment Variables:** `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `VITE_API_URL` (must be absolute with protocol, e.g., `https://...`), `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_AI_MODEL`, `OPENAI_AI_MODEL`, `AI_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`, `RAG_MAX_CONTEXT_CHARS`, `RAG_TOP_K`, `CORS_ORIGINS` (supports JSON lists or comma-separated strings), `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS`, `VITE_MAX_MANUAL_SIZE_MB` (frontend maximum manual size in MB), `MAX_MANUAL_SIZE_MB` (backend maximum manual size in MB).

---

## Scalability & Performance

### 1. Backend Concurrency
The FastAPI backend is built on `asyncio` and runs inside Docker. For production, it should be deployed with:
- **Multiple Workers**: Use `uvicorn --workers N` to leverage multi-core CPUs.
- **Asynchronous Execution**: The backend uses a fully non-blocking `AsyncClient` for Supabase, preventing I/O-bound requests (AI, DB) from starving the event loop.
- **Auto-scaling**: Deploying to AWS ECS, GCP Cloud Run, or Kubernetes (K8s) allows horizontal scaling based on CPU/RAM usage.

### 2. State & Rate Limiting
The current `RateLimiter` is **in-memory** and **threading-based**. This means limits are per-instance. 
- **Transition**: If scaling horizontally, use a centralized **Redis** instance to store rate limits and shared state.

### 3. Database Scaling
Supabase's PostgreSQL is highly performant but has connection limits based on the project tier.
- **Connection Pooling**: Always use the **Transaction Pooler** (port 6543) if several small requests hit the DB concurrently to avoid "Too many connections" errors.
- **Vector Search**: pgvector HNSW indexes are memory-intensive. Monitor RAM as the number of manual chunks grows into the millions.

### 4. AI Provider Failover
The architecture supports multiple AI providers (OpenAI, Gemini).
- **Rate Limit Resilience**: The system currently uses one provider globally. If one provider's TPM/RPM limits are hit, a potential enhancement is a **Round-Robin** or **Priority-based** dispatcher to switch between providers dynamically.

---

## Architecture Decision Records (ADRs)

### ADR-001: Folder-Based Feature Documentation
**Date:** 2026-03-07 | **Status:** Accepted

**Context:** A single `functionalities.md` file does not scale beyond a handful of features; it causes merge conflicts and requires loading all context for every update.

**Decision:** Use a `docs/functionalities/` folder with one file per feature and a lightweight `_index.md` manifest.

**Consequences:** Each feature file is small and focused. AI agents can load only what they need.

---

### ADR-002: Standardized Embedding Dimension (1536)
**Date:** 2026-03-07 | **Status:** Accepted

**Context:** The original dimension was 3072 (OpenAI text-embedding-3-large), which exceeded the pgvector HNSW index limit of 2000. Dimensions were later tested at 384 (all-minilm-l6-v2) but were insufficient for production quality. An intermediate value of 1536 matches OpenAI text-embedding-3-small and allows HNSW indexing.

**Decision:** Standardize all embedding columns (`manual_chunks.embedding`, `manuals.summary_embedding`) at 1536 dimensions.

**Consequences:** Requires re-indexing when the dimension changes. All providers must produce 1536d vectors or be configured to truncate.

---

### ADR-003: Embedding Task Types for Retrieval Quality
**Date:** 2026-03-07 | **Status:** Accepted

**Context:** Google Gemini and OpenAI support task-type hints in embedding calls (`RETRIEVAL_DOCUMENT` vs. `RETRIEVAL_QUERY`). Using the same task type for both indexing and querying degrades retrieval quality.

**Decision:** Use `RETRIEVAL_DOCUMENT` for indexing chunks and summaries; use `RETRIEVAL_QUERY` for query embeddings at search time.

**Consequences:** Embedding calls must pass the correct task type. The `ai_service.py` embedding methods accept a `task_type` parameter.

### ADR-004: Company-Centric Auth Architecture Refactor
**Date:** 2026-03-08 | **Status:** Accepted

**Context:** The original system had ownership tracked via `user_id` columns on `manuals` and `folders`, and `profiles` carried legacy portal fields (`portal_enabled`, `company_name`, `company_slug`). With the move to multi-tenant company-based authentication, these fields became inconsistent. The `company_users` table also lacked a `role` field, making it impossible to distinguish admin vs. regular member at the data level.

**Decision:**
- Drop `user_id` from `manuals` and `folders`; ownership is now exclusively via `company_id` (set by trigger).
- Make `manual_views.user_id` nullable (views are for analytics, not access control).
- Add `role` column to `company_users` (`admin` | `member`, default `member`; existing first-signup user backfilled as `admin`).
- Strip `profiles` to a thin identity table: only `id`, `email`, `created_at`, `updated_at`.
- Update `handle_new_user()` and `ensure_company_membership()` DB functions to set `role = 'admin'` for the account creator.

**Consequences:** Simpler data model — every access check flows through `company_users` membership and `company_user_permissions`. The `role` field is UI-visible in `CompanyUsers.tsx` and is the foundation for future license enforcement. No data loss; columns were nullable or had defaults before removal.

---

### ADR-005: Privacy-First Cookieless Analytics
**Date:** 2026-03-14 | **Status:** Accepted

**Context:** The public portal needs analytics to show companies which manuals are viewed. However, tracking users with cookies mandates GDPR/ePrivacy cookie banners, which severely harms the UX of a document portal and causes data loss when users reject consent. We needed a way to track "Unique Visitors" without storing PII or setting tracking cookies.

**Decision:**
- Adopt a cookieless, privacy-by-design tracking architecture.
- Remove `user_id` from `manual_views`.
- Implement a backend endpoint (`POST /api/v1/analytics/view`) that calculates a `hashed_identifier` using `sha256(IP_Address + Daily_Random_Salt)`.
- The salt rotates daily (or weekly) to ensure the hash cannot be used for long-term tracking or re-identification.
- Remove AI chat logging from public portals for now, as linking chat messages to an individual over time requires a persistent identifier (deferred to future implementation using ephemeral session IDs).

**Consequences:**
- Avoids the need for intrusive cookie banners on the public portal.
- "Unique Visitors" are strictly defined as *daily* unique IPs. If a user visits on Monday and Tuesday, they count as two unique visitors.
- If multiple employees behind a corporate NAT access the portal, they appear as a single unique visitor.
- Long-term user retention metrics cannot be computed.
- Architecture is future-proofed; if requirements change, a fallback cookie-based approach is documented in `docs/future/analytics-cookies.md`.

---

### ADR-006: Global Superadmin Role
**Date:** 2026-03-13 | **Status:** Accepted

**Context:** Platform administrators need the ability to see and manage all tenants (companies), users, and manuals across the application to handle billing, licensing, and support without being constrained by tenant-level RLS policies. It is impractical for a superadmin to be a `company_user` member of every single tenant.

**Decision:** 
- Add an `is_superadmin` boolean field to the `profiles` table.
- Implement a `is_superadmin(user_id)` database function to check the status.
- Add `OR is_superadmin(auth.uid())` equivalents via separate RLS policies (e.g., `FOR SELECT USING (is_superadmin())` and `FOR UPDATE ...`) across core tables (`profiles`, `companies`, `company_users`, `manuals`, `folders`, `manual_views`) so superadmins bypass normal tenant isolation.
- Develop a protected `/superadmin` root-level route in the frontend that is only accessible if `isSuperadmin` is true in `AuthContext`.

**Consequences:** 
- Keep the `company_users.role` specific to intra-tenant administration (`admin` vs `member`). Only system owners have `is_superadmin = true`.
- RLS complexity slightly increases due to extra policies for superadmin overrides.
- Allows the addition of a backend/support backoffice for easy data visualization and manipulation.

---

### ADR-007: Dynamic Licensing and Company Provisioning
**Date:** 2026-03-13 | **Status:** Accepted

**Context:** We need to enforce limits (users, manuals, public manuals) and gate features (analytics) dynamically based on what the company pays for. Previously, the system used public sign-ups creating isolated workspaces.

**Decision:** 
- Transition to a Superadmin-provisioned model: Public sign-ups are disabled. All companies and their initial admins are provisioned by superadmins via `/superadmin` dashboard endpoints.
- Introduce `licenses` table holding the quota rules (templates), and a `company_licenses` association table.
- Enforce constraints using PostgreSQL triggers (`enforce_user_limit`, `enforce_manual_limit`, `enforce_public_manual_limit`) to ensure data integrity regardless of the API entry point.
- Gate frontend features using `AuthContext` enriched with license features (e.g., `license.features.analytics`).

**Consequences:** 
- Strict control over company creation prevents abuse.
- Direct limit references mean updating a license template updates all associated companies globally.
- Direct limit references mean updating a license template updates all associated companies globally.
- Error toasts/dialogs appear in the UI when limits are hit, improving discoverability over silently disabled buttons.

---

### ADR-008: Cost-Aware AI Instrumentation
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

---

### ADR-009: Mobile-First Responsive Architecture and State Preservation
**Date:** 2026-03-28 | **Status:** Accepted

**Context:** The application was initially designed for desktop-sized viewports, using `ResizablePanelGroup` for sidebars (AI Chat, Discovery). On mobile devices, these multi-column layouts collapsed poorly, and unmounting chat panels to switch views caused loss of conversation state, frustrating users who needed to reference the document and chat intermittently.

**Decision:**
- Adopt a **Mobile-First** responsiveness strategy using Tailwind's `sm:` and `md:` prefixes across all administrative and portal headers.
- Implement a `useIsMobile` hook (breakpoint: 768px) to toggle layout logic programmatically.
- **Bypass ResizablePanels on Mobile**: On small screens, sidebars (AIChat, DiscoveryChat) are rendered as absolute-positioned overlays (`absolute inset-0 z-50`) instead of flex-basis panels.
- **State Preservation via CSS Visibility**: Instead of conditionally mounting chat components (`{isOpen && <Chat />}`), keep them permanently mounted and toggle visibility using Tailwind's `hidden` class. This ensures React state and scroll positions are preserved when the user toggles the chat interface.
- **Text Truncation & Icon-Only Fallbacks**: Headers now hide textual labels (e.g., "Back", "AI Chat") on mobile, showing only icons to prevent horizontal overflow.

**Consequences:**
- Improved UX on mobile devices (e.g., iPhone/Android) with full-screen focus.
- Seamless "switching" between reading a manual and chatting with AI without losing context.
- Increased DOM size (slightly) as components stay mounted, but performance remains high due to efficient React reconciliation.
- Consistent branding and navigation across all screen sizes.

---

### ADR-010: Asynchronous AI Chat Classification Pipeline
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

---

### ADR-011: Private Portal Authentication Separation
**Date:** 2026-05-02 | **Status:** Accepted

**Context:** Companies need to restrict portal access to a defined list of external users (e.g., B2B clients, partners) without granting those users access to the internal dashboard. The existing auth system creates `company_users` on invite acceptance, which grants dashboard access. A separate identity class was needed for portal-only users.

**Decision:**
- Add `portal_privacy` column (`public` | `private`, default `public`) to `companies` using a `CHECK` constraint (consistent with existing `manual_type` and `role` patterns; avoids a separate ENUM type migration).
- Introduce two new tables: `portal_users` (active portal-only members) and `portal_invites` (pending invitations with expiry).
- The `handle_new_user()` DB trigger is extended with an `ELSIF portal_invite_token` branch that runs only when no `invite_token` is present, inserting into `portal_users` instead of `company_users`. The `ELSIF` ordering is critical.
- `DashboardRoute` in `App.tsx` renders an inline "no access" screen (not a redirect to `/auth`) for users with no `companyUserId` and no superadmin flag, breaking the redirect loop that portal-only users would otherwise trigger.
- Access enforcement is dual-layered: the Edge Function validates the Bearer token and checks `portal_users` OR `company_users`; FastAPI `chat.py` and `discovery.py` also reject anonymous callers on private portals. This prevents both direct portal access and indirect AI API access.
- HTTP 401 (no/invalid token) and HTTP 403 (authenticated but unauthorized) are handled differently on the frontend: 401 triggers a login redirect; 403 shows an inline error without redirect, preventing a loop for authenticated users without access.

**Consequences:**
- Portal-only users and dashboard users are cleanly separated at the data model level with no overlap.
- `CompanyPortalLogin.tsx` is a fully independent page with its own branding fetch, decoupled from `Auth.tsx`.
- Switching a portal from public to private does not affect any existing `company_users` rows.
- The `handle_new_user()` trigger now has three branches; branch ordering must be maintained on future changes.
