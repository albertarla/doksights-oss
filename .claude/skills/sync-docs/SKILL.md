---
name: sync-docs
description: Keeps docs/functionalities/, docs/architecture.md and docs/adr/ in sync with what is actually implemented in DokSights. Use at the end of every implementation, refactor or feature addition, before running the final quality gate.
---

> Templates for this skill live in `resources/` next to this file.

# Sync documentation with the implementation

Docs describe what is **implemented and working**, never planned features (those live in `docs/future/`).

## 1. Triage: what needs updating?

| Change type | `docs/functionalities/` | `docs/architecture.md` | New ADR |
| :--- | :---: | :---: | :---: |
| New user-facing page or feature | ✅ | ✅ if a new layer/service appears | if a non-obvious decision was made |
| New API endpoint | ✅ (feature's API Surface) | ❌ | ❌ |
| New AI call, model or provider change | ✅ (incl. token tracking) | ✅ (Data Flow with the token-logging step) | ✅ for a provider change |
| DB schema change | ✅ (Data Model) | ✅ (Database Schema) | if it breaks compatibility or changes ownership/access |
| Refactor, no behavior change | ❌ | ✅ if stack or data flow changed | if it deliberately departs from an approach |
| Bug fix | ❌ | ❌ | ❌ |
| Config / infra / deploy change | ❌ (README / `.env.example` if user-facing) | ✅ (Infrastructure & Deployment) | if it changes the deployment model |

If no row matches, say so (one line) in the final report and stop.

## 2. Update a feature file

1. Find it via `docs/functionalities/_index.md`. Missing? Create it from `resources/functional-template.md`
   (H1 = feature name, H2 = sections). Missing index? Seed it from `resources/_index-template.md`.
2. **Read the file first**, then edit only the affected sections. Never rewrite the whole file.
3. Keep the header lines current: `**Status:**` (`Draft` · `Dev` · `Stable`), `**Last Updated:**` (today,
   YYYY-MM-DD) and `**Related ADR:**` (comma-separated ids; the `architecture-scout` agent relies on this line).
4. **AI features:** Functional Requirements or Data Model say how tokens are logged to `ai_token_usage_logs` and
   whether embedding tokens are consolidated into the session's prompt tokens (ADR-008).
5. Use repo-relative links, never absolute paths.
6. Update the feature's row in `_index.md` (status, date); add a row for a new file. Every file in the folder must
   have exactly one row, and no row may point to a missing file.

## 3. Update `docs/architecture.md`

Read it first; edit only the relevant section (Technology Stack, Component Responsibilities, Database Schema, Data
Flows, Infrastructure). Update `**Last Updated:**` if present. ADR text does **not** live here. Seed a missing file
from `resources/architecture-template.md`.

## 4. Write an ADR (only for deliberate, non-obvious decisions)

1. Next free number in `docs/adr/` → copy `docs/adr/_template.md` to `docs/adr/ADR-NNN-<slug>.md` and fill it in.
2. Add a row to `docs/adr/_index.md` with a one-line **rule of thumb**. That row is loaded into every Claude
   session, so make it concrete ("X must go through Y"), not descriptive.
3. Add the id to the related feature files' `**Related ADR:**` line.
4. Replacing an older decision? Set its status to `Superseded (by ADR-NNN)` or `Accepted (amended by ADR-NNN)` in
   both its file and the index.

## 5. User-facing docs

If setup, configuration or behavior a self-hoster sees changed, update `README.md`, `.env.example` or
`docs/user_documentation/` too.

## 6. Report

End the task's final message with:

**📝 Documentation Sync**

- `<file>`: one-line reason
- …or "No documentation update needed: <reason>"
