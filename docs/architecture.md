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

ADRs live in [`docs/adr/`](./adr/_index.md), one file per decision. The [index](./adr/_index.md) lists each one with the rule code must follow.
