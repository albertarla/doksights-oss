# Architecture Decision Records — Index

This index is imported into `CLAUDE.md`, so every agent session knows the binding rule of each decision.
Open the full ADR file only when a task touches that decision (feature docs list theirs under `**Related ADR:**`).

**To add an ADR:** copy [`_template.md`](./_template.md) to `docs/adr/ADR-NNN-<slug>.md` (next free number),
fill it in, and add a row here with a one-line *rule of thumb*. Never renumber or delete ADRs: mark them `Superseded`.

| ADR | Decision | Status | Rule of thumb (what code must do) |
| :--- | :--- | :--- | :--- |
| [ADR-001](./ADR-001-folder-based-feature-documentation.md) | Folder-Based Feature Documentation | Accepted | One file per feature in `docs/functionalities/`, listed in `_index.md`; read only the feature files a task touches. |
| [ADR-002](./ADR-002-standardized-embedding-dimension-1536.md) | Standardized Embedding Dimension (1536) | Accepted | Every embedding (chunks, summaries, chat themes) is 1536-d to fit the pgvector HNSW limit; changing it needs a migration and a full re-index. |
| [ADR-003](./ADR-003-embedding-task-types-for-retrieval-quality.md) | Embedding Task Types for Retrieval Quality | Accepted | Index chunks and summaries with `RETRIEVAL_DOCUMENT`, embed search queries with `RETRIEVAL_QUERY`; always pass `task_type`. |
| [ADR-004](./ADR-004-company-centric-auth-architecture-refactor.md) | Company-Centric Auth Architecture Refactor | Accepted | Data belongs to a company (`company_id`, set by trigger), never a user; access checks go through `company_users` membership plus `company_user_permissions`; `profiles` stays a thin identity table. |
| [ADR-005](./ADR-005-privacy-first-cookieless-analytics.md) | Privacy-First Cookieless Analytics | Accepted | Portal analytics are cookieless: a visitor is a daily-salted `sha256(IP)` hash; never store user ids, cookies or other persistent identifiers for portal visitors. |
| [ADR-006](./ADR-006-global-superadmin-role.md) | Global Superadmin Role | Accepted | Instance admins are `profiles.is_superadmin` (checked with `is_superadmin()`), with their own RLS override policies; never make them company members; `company_users.role` stays tenant-scoped. |
| [ADR-007](./ADR-007-dynamic-licensing-and-company-provisioning.md) | Dynamic Licensing and Company Provisioning | Accepted (amended by ADR-012) | Limits and feature gates are rows in `licenses` / `company_licenses`, enforced by Postgres triggers and read by the UI through `AuthContext`; never hardcode a limit. (Sign-up and provisioning are amended by ADR-012.) |
| [ADR-008](./ADR-008-cost-aware-ai-instrumentation.md) | Cost-Aware AI Instrumentation | Accepted | Every AI call logs its tokens to `ai_token_usage_logs` through `AnalyticsService.log_token_usage` (fallback: provider `count_tokens`); embedding tokens count as the session's prompt tokens. |
| [ADR-009](./ADR-009-mobile-first-responsive-architecture-and-state-preservation.md) | Mobile-First Responsive Architecture and State Preservation | Accepted | Mobile-first: below 768px (`useIsMobile`) side panels are absolute overlays, never `ResizablePanelGroup`; chat panels stay mounted and are hidden with `hidden`, never conditionally rendered. |
| [ADR-010](./ADR-010-asynchronous-ai-chat-classification-pipeline.md) | Asynchronous AI Chat Classification Pipeline | Accepted | Chat classification runs only in the background job (APScheduler, `CLASSIFICATION_ENABLED`) on sessions idle >= 2 h, using a cheaper model and `cron_locks`; never classify inside a chat request. |
| [ADR-011](./ADR-011-private-portal-authentication-separation.md) | Private Portal Authentication Separation | Accepted | Portal-only users live in `portal_users` / `portal_invites`, never `company_users`; private portals are enforced in both the Edge Function and FastAPI chat/discovery; keep `handle_new_user()` branch order (company invite before portal invite). |
| [ADR-012](./ADR-012-self-hosted-bootstrap.md) | Self-Hosted Bootstrap and Open Sign-Up | Accepted | Migrations alone must make a fresh Supabase project usable (storage buckets, permission keys, a default "Self-hosted" license auto-assigned to every company); the first account becomes instance admin with a workspace; bootstrap SQL stays idempotent and safe on existing databases. |
