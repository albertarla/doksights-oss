---
name: ci-runner
description: Runs the complete DokSights quality gate (scripts/run-all-checks.sh or .ps1), the same checks GitHub Actions runs. Use whenever the user asks to run CI, validate or run the quality gates, and before declaring any task done.
---

# CI runner

The Definition of Done is one script with the same steps locally and in CI. Never replace it with a hand-picked
subset when reporting a task as done.

## Run it

- macOS / Linux / Git Bash: `bash scripts/run-all-checks.sh`
- Windows PowerShell: `powershell -ExecutionPolicy Bypass -File scripts/run-all-checks.ps1`

Options: `--list`, `--only id,id`, `--skip id,id` (PowerShell: `-List`, `-Only`, `-Skip`). A run with skipped steps
ends with **PARTIAL**: it is not the gate, and you must say which steps did not run.

Prerequisites: `npm ci` in `frontend/`, backend requirements installed, and [gitleaks](https://github.com/gitleaks/gitleaks)
on the PATH (without it the `secrets` step is skipped and the run is PARTIAL). The full run takes about a minute.

## Steps, in order

| id | What it checks |
| :--- | :--- |
| `secrets` | gitleaks over git history and every non-ignored file (a local, gitignored `.env` is allowed to hold keys) |
| `backend-tests` | `python -m pytest` in `backend/` |
| `frontend-lint` | ESLint with 0 errors (warnings allowed in legacy code; the edit hook enforces 0 warnings per edited file) |
| `frontend-typecheck` | `tsc --noEmit` for the app and node configs |
| `frontend-tests` | Vitest |
| `frontend-build` | `vite build` |

GitHub Actions (`.github/workflows/ci.yml`) runs the same checks as parallel jobs.

## When it fails

1. Read the failing step's output (it's printed above the summary).
2. Fix the cause, then re-run just that step with `--only <id>` while iterating.
3. Finish with one full run. Report the final summary block as-is.

Not covered by the gate (say so when relevant): Playwright e2e, migrations from zero (`supabase db reset`), and a
browser check of the change.
