---
name: plan-task
description: Architecture-aware planning for any implementation, refactor or bug fix in DokSights. Use at the start of a task, before writing code, to gather the relevant feature docs and ADR constraints and produce a plan for approval.
argument-hint: "<task description>"
---

# Plan a task with the architecture in mind

Task: $ARGUMENTS

Goal: a plan that respects the documented architecture **without** loading every doc into this session.

Run this skill in **plan mode**: call `EnterPlanMode` first (skip it if the session is already in plan mode), so
steps 1–4 stay read-only and nothing is edited before the plan is approved.

## 1. Pin down the requirement

- If the request is ambiguous in a way that changes the design, ask before planning.
- For a bug, reproduce it or find the failing path first; note the expected vs actual behavior.

## 2. Get the architecture brief (delegate; don't read the docs yourself)

Launch the **`architecture-scout`** agent with the task text. It reads `docs/functionalities/_index.md`, the matching
feature docs, the ADRs those features reference, the path rules and the relevant code, and returns a one-page brief.
Read a full ADR or doc yourself only if the brief marks it as essential or something is unclear.

## 3. Check the code it points to

Open only the files the brief names as entry points or patterns to reuse. Confirm they still look as described.

## 4. Classify the change

| Question | Answer |
| :--- | :--- |
| Existing feature or new one? | name it / "new feature → new `docs/functionalities/<name>.md`" |
| Which layers? | frontend · backend · database · edge function |
| DB schema change? | which tables/columns/RPCs/buckets, the new migration, and whether it's safe on an existing database (ADR-012) |
| Authorization? | who may do it (role, permission key, portal user, superadmin, anonymous) and where the server-side check lives |
| AI and tokens? | which model calls, token logging and quota checks (ADR-008) |
| Contradicts or extends an ADR? | which one and why; a deliberate departure needs a new ADR |
| New setting or dependency? | name it; settings go in `config.py` and `.env.example` |

## 5. Write the plan

Write the plan in this shape and submit it with `ExitPlanMode` for approval. Don't paste it in chat and ask
"Shall I proceed?": the approval dialog is the gate.

1. **Scope**: one or two sentences + the classification above.
2. **Architecture alignment**: the ADRs that bind this change and how the plan satisfies each.
3. **Changes**: files to create/edit, grouped by layer (database → backend → frontend).
4. **Tests**: backend pytest (including 401/403 and cross-company denials), frontend Vitest (including a
   `useIsMobile(true)` case for new pages), Playwright for changed user flows.
5. **Docs**: which feature doc / architecture / ADR files `sync-docs` will update.
6. **Verification**: targeted commands while iterating, then `architecture-reviewer` for non-trivial changes, then the
   full gate (`ci-runner`). Schema changes also get `supabase db reset` plus a manual check.
7. **Risks & open questions.**

Do not edit files until `ExitPlanMode` is approved. If the plan is rejected, revise it and call `ExitPlanMode` again.
