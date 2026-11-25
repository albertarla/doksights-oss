---
paths:
  - "frontend/**"
---

# Frontend rules (React · Vite · TypeScript · Tailwind · shadcn/ui)

## Code

- Components come from `src/components/ui/` (shadcn). Style with Tailwind classes and the theme tokens in
  `index.css`; no new CSS frameworks or inline hex colors outside the portal theming helpers in `src/lib/utils.ts`.
- Data access: the Supabase client (`@/integrations/supabase/client`) for RLS-protected reads and writes; the FastAPI
  backend (`CHAT_API_CONFIG.BASE_URL`, i.e. `VITE_API_URL`) for chat, indexing, analytics and admin actions.
- Only `VITE_*` variables reach the browser, and they are public. Never reference a service-role key or secret here.
- Permissions: gate UI with `usePermissions` / `AuthContext`, but remember the server enforces access; the UI only
  hides what the user can't use.
- License limits and features come from `AuthContext` (`license`); `max_ai_tokens === null` means unlimited.
- No new `any`. ESLint must be clean on every file you edit (the edit hook runs it with `--max-warnings 0`).

## Mobile-first layout (ADR-009)

Design for 375px first, then enhance with `sm:` / `md:` / `lg:`.

- **Headers never overflow horizontally:** use `flex-wrap`, hide button labels on small screens
  (`<span className="hidden sm:inline">Back</span>`), keep icons visible, `truncate` long titles.
- **Keep stateful panels mounted.** Chat panels (`AIChatPanel`, `DiscoveryChat`), search results and scroll
  containers are hidden with the `hidden` class, never conditionally rendered, so closing and reopening keeps their state.
- **No `ResizablePanelGroup` on mobile.** Use `useIsMobile()` (`@/hooks/use-mobile`, breakpoint 768px) and render
  side panels as `absolute inset-0 z-50 bg-background` overlays instead.
- Don't put `overflow: scroll` on `html`/`body`; scroll inside containers with `overflow-y-auto`.
- Icon-only buttons need an `aria-label` or `title`.

## Tests

- New components, hooks and pages get a colocated `*.test.tsx` / `*.test.ts` (Vitest + Testing Library;
  `frontend-tests` skill). Mock Supabase and `fetch`.
- Every new page or major layout change includes a test that mocks `useIsMobile` to `true` and checks it renders and
  shows the mobile-only elements.
- Route-level flows that change get a Playwright case in `frontend/tests/e2e/`.
