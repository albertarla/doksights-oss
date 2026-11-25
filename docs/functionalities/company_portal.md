# Company Portal
**Status:** Stable
**Last Updated:** 2026-05-06
**Related ADR:** ADR-009, ADR-011

## Objective
Provide a branded web portal per company where visitors can browse, search, and read manuals, and use AI-powered Manual Discovery. Portals can be **public** (no login required) or **private** (login + portal access required).

## User Stories
- As a guest, I want to browse a company's public manuals organized by folder, so that I can find relevant documents.
- As a guest, I want to search manuals by title/description, so that I can filter quickly.
- As a guest, I want to read a manual inline without downloading or logging in.
- As a guest, I want to use an AI chat assistant to describe my problem and get manual recommendations.
- As an authorized portal user, I want to log in to a private portal and access its manuals.
- As an authorized portal user, I want to be redirected to the login page if my session expires.

## Functional Requirements
- Accessible at `/company/{companySlug}`.
- Portal data is fetched via the `get-company-portal` **Supabase Edge Function** (includes company branding, folders, and manuals).
- If `company.portal_enabled = false`, the portal returns an error and the page shows "Portal Not Available".
- **Private portal access control** (when `portal_privacy = 'private'`):
  - The frontend sends the Supabase session `access_token` in the `Authorization: Bearer` header to the Edge Function.
  - Edge Function verifies the JWT via `supabase.auth.getUser(token)`.
  - Access is granted if the user has a row in `portal_users` OR `company_users` (active status) for the company.
  - If no token is present or the token is invalid → Edge Function returns `{ error: 'PRIVATE_PORTAL', slug }` with HTTP 401 → `CompanyPortal.tsx` redirects to `/company/{slug}/login?returnTo={currentPath}`.
  - If the token is valid but the user has no portal access → Edge Function returns `{ error: 'PORTAL_ACCESS_DENIED' }` with HTTP 403 → `CompanyPortal.tsx` shows an inline "do not have permission" error (no redirect).
  - Private portals block AI Discovery and AI Chat for unauthenticated callers at the FastAPI layer too.
- **Public portal** (`portal_privacy = 'public'`): no auth required — existing behaviour unchanged.
- **Company branding** is applied: custom `primaryColor`, `backgroundColor`, `logoUrl`, `description`.
  - A dynamic theming system derives high-contrast variables for `--card`, `--muted`, and `--border` from the background color to ensure visual depth and readability.
- **Manual search:** client-side text filter on `title` and `description` across all folders and uncategorized manuals.
- **Folder grid:** `FolderGrid` component renders each folder and its manuals.
- **Uncategorized manuals:** displayed below folders under "Other Manuals".
- **Inline manual viewer:** clicking a manual opens a dedicated reader:
  - For PDF manuals: `PortalManualViewer` (PDF.js-based).
  - For Web manuals: `WebManualViewer` (Markdown-based, fetching from `manual_sections`).
- Both viewers include an integrated **AI chat panel** for manual-specific queries.
- **Discovery Chat** (floating button "Find a Document"):
  - Appears when there are manuals.
  - Opens a `DiscoveryChat` sidebar that calls `POST /api/v1/chat/discover` with the company's `slug`.
  - Returns AI-recommended manuals based on a natural language query.
- Each portal view is tracked in `manual_views` via the `get-company-portal` Edge Function.
- **Mobile Responsiveness**:
  - Portal adapts to all screen sizes (mobile-first).
  - Main header hides non-essential labels on small screens.
  - Discovery chat uses a full-screen absolute overlay on mobile.
  - State preservation is enforced for all chat interactions when toggling views on mobile.

## API Surface

| Method | Source | Auth | Description |
| :--- | :--- | :--- | :--- |
| `get-company-portal` Edge Function | Supabase | Optional Bearer | Fetch portal data; enforces private access when `portal_privacy = 'private'` |
| POST | `/api/v1/chat/discover` | Optional | AI manual discovery by `company_slug`; rejects anonymous on private portals |
| POST | `/api/v1/chat/stream` | Optional | AI chat for a specific manual; rejects anonymous on private portals |

## Data Model

- **Table `companies`:** Read for name, branding, `portal_enabled`, `portal_privacy`, `slug`.
- **Table `portal_users`:** Authorised portal-only users (`company_id`, `user_id`, `email`). RLS: readable by company members.
- **Table `portal_invites`:** Pending email invitations (`company_id`, `email`, `token` UUID, `expires_at`, `accepted_at`). Consumed by `handle_new_user()` trigger on sign-up.
- **Table `folders`:** Read for company folders (RLS: portal-enabled companies).
- **Table `manuals`:** Read for public manuals (`is_public = true`, portal-enabled company).
- **Table `manual_views`:** Written on each portal view (via Edge Function).
- **Storage Bucket `company-logos`:** Public. Files stored as `{company_id}/{filename}`.

## Acceptance Criteria
- [ ] Public portal loads at `/company/{slug}` without authentication.
- [ ] A company with `portal_enabled = false` shows "Portal Not Available".
- [ ] Private portal with no token redirects to `/company/{slug}/login`.
- [ ] Private portal with valid token but no access shows an inline "do not have permission" error.
- [ ] Private portal with valid token and portal access renders normally.
- [ ] AI Discovery and AI Chat are blocked for anonymous callers on private portals.
- [ ] Custom branding (colors, logo) is applied to the portal page.
- [ ] Search filters manuals in real-time without a network request.
- [ ] Clicking a manual opens the appropriate inline viewer (PDF or Web).
- [ ] The "Find a Document" button opens the Discovery Chat sidebar.
- [ ] Adaptive mobile-first layout (no horizontal scroll).
- [ ] Discovery Chat state is preserved when closing/reopening on mobile.
