---
name: backend-tests
description: Writes and runs pytest tests for the DokSights FastAPI backend. Use when backend code changes, to add tests for new logic and to run the backend suite; also usable as a verify-only subagent that reports a pass/fail summary.
---

# Backend tests (pytest)

## Two ways to use this skill

- **In this session (write + run loop):** write or fix tests, run them, iterate until they pass.
- **As a subagent (verify only):** run the suite once and return a compact summary ("196 passed, 0 failed"). Don't
  edit source files; report failures back so the main session fixes them.

## Run

Run from `backend/` with the project's Python (3.11+, `pip install -r requirements.txt`). No database, network or AI
key is needed: tests mock Supabase and the AI provider.

| Purpose | Command |
| :--- | :--- |
| Whole suite, quiet | `python -m pytest -q --tb=short -r f` |
| One file or test | `python -m pytest tests/test_chat_router.py -q` · `python -m pytest tests/test_x.py::test_name -q` |
| Only last failures | `python -m pytest --lf --tb=short` |
| Stop at first failure | `python -m pytest -x --tb=short` |
| Coverage | `python -m pytest --cov=app --cov-report=term-missing -q` |

In Docker instead: `docker compose run --rm backend python -m pytest -q`.

Keep output small: avoid `-v` unless debugging one test; `--tb=short -r f` shows only what failed.

## Writing tests

1. Start from `resources/test-template.py` and the closest existing file in `backend/tests/` (same fixtures, same
   mocking style). Shared fixtures live in `backend/tests/conftest.py`.
2. Patch at the use site: `patch("app.routers.chat.supabase_service.get_manual", AsyncMock(...))`, not the
   service module itself. Override auth with `app.dependency_overrides[verify_supabase_token]` and clear it after.
3. Cover, for every new endpoint or service method:
   - the success path;
   - edge cases (empty input, missing record, `None` fields);
   - failures: 401 without a token, 403 without permission or for another company's data, 404, provider errors and
     `TokenQuotaExceededError` where AI is involved.
4. Never weaken or delete an existing assertion to get green. If a test is obsolete because behavior changed on
   purpose, update it and say so.
