# DokSights — Claude Code instructions

Open-source, self-hosted documentation portal with RAG chat. Companies (workspaces) upload PDFs or write web
manuals, publish them in a branded public or private portal at `/company/<slug>`, and readers ask questions that are
answered from the documents. Analytics show what readers look for.

Stack: **React + Vite + Tailwind/shadcn** (`frontend/`), **FastAPI** (`backend/`), **Supabase** Postgres + pgvector,
Auth, Storage and one Edge Function (`supabase/`). AI: **Google Gemini only** (chat and embeddings); the OpenAI
provider in `ai_service.py` is untested and not supported. Product docs: `docs/functionalities/` (one file per feature)
and `docs/architecture.md`.

## Architecture decisions — always binding

The index below is the rule set every change must respect. Full rationale lives in each `docs/adr/ADR-NNN-*.md`;
open one only when your task touches that decision.

@docs/adr/_index.md

## Non-negotiables

- **Tenant isolation.** Data belongs to a company. Every table has RLS. The backend uses the service-role client,
  which bypasses RLS, so every backend route checks membership and permission itself (`verify_supabase_token`, then
  `supabase_service.get_manual` / `_has_company_permission` / `is_superadmin`) before reading or writing. Hiding a
  button in the UI is not access control.
- **Private portals are enforced on the server**, in both the `get-company-portal` Edge Function and FastAPI
  chat/discovery (ADR-011).
- **Secrets never enter git** (`.env*` are ignored; only `.env.example` is committed). The service-role key is
  server-side only: never in a `VITE_*` variable or frontend code.
- **Migrations are append-only** and a fresh install must work from them alone (ADR-012): never edit an applied
  migration, add a new timestamped file; seeds and bootstrap SQL stay idempotent.
- **Embeddings are 1536-d** (ADR-002), and **every AI call logs its tokens** (ADR-008).

## How to work on a task

1. **Understand before coding.** For anything beyond a trivial, local fix, run the `plan-task` skill. It delegates the
   doc reading to the `architecture-scout` agent and ends with a plan for approval.
2. **State scope up front:** which feature(s) it touches (or that it's a new feature), whether it changes the DB
   schema, and any deviation from an ADR. Never add a new table, service, AI provider or dependency without saying so.
3. **If docs and code disagree, say so** before proceeding. Code is the truth, and the docs get fixed.
4. **Write tests with the code** (`backend-tests` / `frontend-tests` skills). No new behavior without tests.
5. **Before calling it done:** for non-trivial changes run the `architecture-reviewer` agent on the diff, then the
   `sync-docs` skill, then the full gate (`ci-runner` skill).

## Commands

| Purpose | Command |
| :--- | :--- |
| Local Supabase (DB, Auth, Storage, Edge Functions, Mailpit) | `supabase start` · `supabase stop` · `supabase status -o env` |
| Re-apply every migration from zero | `supabase db reset` |
| New migration | `supabase migration new <slug>` (creates `supabase/migrations/<timestamp>_<slug>.sql`) |
| Full app in Docker (backend :8000, frontend :8080) | `docker compose up --build` |
| Backend dev server | `cd backend && uvicorn app.main:app --reload --port 8000` |
| Backend tests | `cd backend && python -m pytest -q` (one file: `python -m pytest tests/test_x.py -q`) |
| Frontend install / dev | `cd frontend && npm ci` · `npm run dev` |
| Frontend lint · typecheck | `npx eslint <file>` · `npm run typecheck` |
| Frontend tests | `npx vitest run` (one file: `npx vitest run src/pages/X.test.tsx`) |
| **Full gate** | `bash scripts/run-all-checks.sh` · `powershell -ExecutionPolicy Bypass -File scripts/run-all-checks.ps1` (`--list`, `--only`, `--skip`) |

Targeted commands are for iterating; they do **not** count as verification. The `.env` for local work comes from
`.env.example` filled with `supabase status -o env` (see README).

## Definition of Done (hard gate)

A task is complete only when **all** hold:

- New or changed behavior has tests, and existing tests still pass.
- ESLint has 0 errors; every file you edited has 0 warnings (the edit hook enforces this). `no-explicit-any` is a
  warning only because of legacy code: don't add new `any`s, and remove the ones in files you touch.
- Typecheck is clean.
- Docs synced (`sync-docs`), and the final message has a **📝 Documentation Sync** section (or says why none was needed).
- `scripts/run-all-checks` ends with `RESULT: ALL CHECKS PASSED`. If something could not run (PARTIAL), say exactly
  what was **not** verified. Never claim success from partial runs.

## Conventions

- Windows and macOS are both dev OSes: shared scripts come in `.sh` and `.ps1` pairs.
- Agent tooling lives only in `.claude/` (skills, agents, rules, hooks). `.agents/` and `AGENTS.md` only point to it
  for Antigravity; never put content there.
- PRs target `main`. Don't commit, tag or push unless asked.
