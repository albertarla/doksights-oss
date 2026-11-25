---
paths:
  - "supabase/**"
---

# Database rules (Supabase Postgres · pgvector · RLS · Edge Functions)

## Migrations

- Create with `supabase migration new <slug>`; one concern per migration. **Never edit a migration that has been
  applied anywhere**: fix forward with a new file.
- A fresh install must work from migrations alone (ADR-012). Anything the app needs to exist (buckets, permission
  keys, default license) is created in a migration, not by hand or in `seed.sql`.
- Write idempotent SQL: `create ... if not exists`, `create or replace function`, `drop trigger if exists` before
  `create trigger`, `insert ... on conflict do nothing`. Migrations must also be safe on an existing database.
- Verify from zero before calling it done: `supabase db reset`, then sign up the first user and exercise the feature.

## Schema and security

- Every new table: `company_id` (or a parent that has one), RLS enabled, policies for members, and a separate
  superadmin policy using `is_superadmin(auth.uid())` (ADR-004, ADR-006). Grant table privileges explicitly to
  `authenticated` / `service_role` (and `anon` only for public-portal reads).
- `SECURITY DEFINER` functions set `search_path` and are owned by `postgres`; keep them small and check
  `auth.uid()` inside when they act on behalf of a user.
- Permission keys live in `public.permissions` (`page.manuals`, `page.users`, `page.analytics`, `page.portal`). A new
  key needs a migration row, the frontend `usePermissions` mapping and the invite labels in `Auth.tsx`.
- Limits are license data enforced by triggers (ADR-007); don't hardcode them in SQL or code.
- Vector columns are `vector(1536)` with HNSW indexes (ADR-002).
- `handle_new_user()` branch order matters: company invite, then portal invite (ADR-011). The first-user bootstrap is a
  separate trigger on `profiles` (ADR-012).

## Edge Function (`supabase/functions/get-company-portal`)

- It serves the public/private portal and signs PDF URLs. Keep private-portal checks there in sync with FastAPI.
- Signed URLs use the function's own `SUPABASE_URL`; the frontend rewrites Docker-internal hosts with
  `toPublicStorageUrl` for local development.
