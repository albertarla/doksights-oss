---
name: frontend-tests
description: Writes and runs Vitest unit/component tests and Playwright e2e tests for the DokSights React frontend. Use when frontend code changes; also usable as a verify-only subagent that reports a pass/fail summary.
---

# Frontend tests (Vitest · Testing Library · Playwright)

## Two ways to use this skill

- **In this session (write + run loop):** write or fix tests, run them, iterate until they pass.
- **As a subagent (verify only):** run the suite once and return a compact summary ("192 passed, 0 failed across 33
  files"). Don't edit source files; report failures back.

## Run

From `frontend/` (after `npm ci`):

| Purpose | Command |
| :--- | :--- |
| Whole suite, quiet | `npx vitest run --silent --reporter=dot` |
| One file | `npx vitest run src/pages/Auth.test.tsx` |
| Coverage | `npm run test:coverage` |
| Lint one file · typecheck | `npx eslint <file> --max-warnings 0` · `npm run typecheck` |
| E2E (Playwright, needs the app running) | `npm run test:e2e -- --reporter=line` |

Run only the files you changed while iterating; the full suite runs in the gate.

## Writing tests

1. Colocate: `Component.tsx` → `Component.test.tsx` in the same folder. E2E specs go in `frontend/tests/e2e/`.
2. Follow the closest existing test: mock `@/integrations/supabase/client`, `@/contexts/AuthContext` and `fetch`
   (`global.fetch = vi.fn() as unknown as typeof fetch`); wrap routed components in a `MemoryRouter`.
3. Cover rendering, the main interaction, loading and error states, and permission-gated UI (hidden without the
   permission).
4. **Mobile (ADR-009):** every new page or major layout change gets a case with `useIsMobile` mocked to `true` that
   asserts it renders and shows the mobile-only elements.
5. Query by role or label (`getByRole`, `getByLabelText`) rather than CSS classes.
6. Never weaken or delete an assertion to get green.
