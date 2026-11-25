# Authentication & Permissions
**Status:** Stable
**Last Updated:** 2026-05-02
**Related ADR:** ADR-004, ADR-012

## Objective
Secure all product endpoints using Supabase-issued JWTs. Implement a granular, per-user permission system that controls access to specific pages in the dashboard. Support invite-based sign-up (joining an existing company), portal-invite sign-up (portal-only access), and a demo request flow for new prospects.

## User Stories
- As an invited user, I want to sign up with an invite token, so that I join the correct company with pre-assigned permissions.
- As an admin, I want to RBAC-gate each page so that users only access what they are permitted to.
- As a guest, I want to access public portals without logging in.
- As a newly provisioned tenant admin, I want to log in with credentials provided by the Superadmin and access my pre-configured workspace.
- As a user who forgot their password, I want to request a reset link and set a new password so I can regain access to my account.
- As a portal-invited user, I want to sign up via an invite link and gain access only to that company's private portal (not the dashboard).

## Functional Requirements
- Frontend uses Supabase Auth client for sign-in, sign-up, sign-out, and session management.
- Backend validates Supabase JWTs using `jose`. Supports **HS256** (symmetric) and **ES256/RS256** (asymmetric JWKS from `/.well-known/jwks.json`). JWKS is cached per process.
- Token expiration check is enforced server-side.
- Optional JWT dependency (`get_optional_user`) allows endpoints to behave differently for authenticated vs. anonymous users.
- **Tenant Provisioning**: Companies are exclusively created by platform Superadmins, who provision the initial Admin account and assign a License.
- **Invite sign-up flow** (triggered by `on_auth_user_created` DB trigger on `auth.users`, detects `invite_token` in metadata):
  1. Matches invite by token or email.
  2. Joins the user to the invite's company.
  3. Assigns only the permissions specified in `company_invite_permissions` (not all).
  4. Marks invite as `accepted_at = now()`.
- **Portal invite sign-up flow** (detected via `portal_invite_token` in `raw_user_meta_data`; checked only when `invite_token` is absent):
  1. `handle_new_user()` trigger looks up `portal_invites` by token (must be not-accepted and not-expired).
  2. Inserts a row in `portal_users` (`company_id`, `user_id`, `email`) — no `company_users` row is created.
  3. Marks invite `accepted_at = now()`.
  4. The new user has no dashboard permissions; `DashboardRoute` shows an inline "no access" screen instead of redirecting.
  5. After portal invite sign-up, frontend redirects the user directly to `/company/{slug}`.
- **`DashboardRoute` guard** (`App.tsx`): wraps all `/dashboard/*`, `/analytics`, `/superadmin`, and internal viewer routes. If the authenticated user has no `companyUserId` and is not a superadmin, an inline "No dashboard access" screen is shown with a sign-out button. No redirect loop to `/auth`.
- **Portal-only user redirect**: `Auth.tsx` post-login navigation to `/dashboard` is gated on `companyUserId || isSuperadmin`. Portal-only users (those with only `portal_users` rows) remain on the auth page after sign-in.
- **`get_portal_invite_context(invite_token)` RPC**: returns invite details (company name, email, expiry) for the `Auth.tsx` portal invite banner. Used to pre-fill and disable the email field, display context, and detect expired/already-accepted invites.
- **Permission keys** (seeded in `permissions` table):
  - `page.analytics` — Access analytics dashboard.
  - `page.users` — Invite and manage company users.
  - `page.portal` — Edit company portal settings.
  - `page.manuals` — Upload and organize manuals and folders.
- **Password Reset flow**:
  1. User clicks "Forgot password?" on the login form.
  2. Frontend calls `supabase.auth.resetPasswordForEmail()` with a redirect URL to `/auth?mode=reset`.
  3. User receives a Supabase-generated email with a recovery link.
  4. Clicking the link redirects the user back to the app; Supabase Auth JS triggers a `PASSWORD_RECOVERY` event.
  5. Frontend detects this event (or the query param) and shows the "Set new password" form.
  6. User submits a new password via `supabase.auth.updateUser()`.
- **First-run bootstrap (self-hosted)**:
  1. The first account ever created on an instance signs up from `/auth` ("Need an account? Create one").
  2. The `bootstrap_first_user` trigger (migration `20261125120000_self_hosted_bootstrap.sql`) marks it as instance admin (`profiles.is_superadmin`), creates a "My workspace" company, and grants every permission.
  3. Every company gets the default "Self-hosted" license automatically (`assign_default_license` trigger).
  4. Later users join through company or portal invites. Users who sign up without an invite get an account with no workspace until an admin adds them.
- Permission checks in frontend use the `usePermissions` hook and `has_company_permission()` DB function.
- RLS policies enforce permission checks at the database level for data access.

## API Surface

| Dependency | Applies To | Description |
| :--- | :--- | :--- |
| `verify_supabase_token` | All protected backend routes | Full JWT validation, returns `JWTPayload` |
| `get_optional_user` | Chat stream, Discover | Optional validation; returns `None` for anonymous |

> Auth itself is managed entirely by Supabase Auth (no custom login endpoint in FastAPI).

## Data Model

- **`auth.users` (Supabase managed):** User credentials, email, and `raw_user_meta_data` (`company_name`, `invite_token`, `portal_invite_token`).
- **Table `profiles`:** `id` (FK → `auth.users`), `email`, `created_at`, `updated_at`. Legacy columns (`company_name`, `company_slug`, `portal_enabled`) removed.
- **Table `companies`:** `id`, `name`, `slug` (unique), `portal_enabled`, `portal_privacy` (`public` | `private`), branding fields.
- **Table `company_users`:** `id`, `company_id`, `user_id`, `role` (`admin` | `member`), `status` (`active` | `invited`), `created_by`. Unique constraint per `(company_id, user_id)` and unique per `user_id`.
- **Table `permissions`:** Static lookup; `key` (PK, e.g., `page.analytics`), `description`, `category`.
- **Table `company_user_permissions`:** `company_user_id`, `permission_key`. Unique per pair.
- **Table `company_invites`:** `company_id`, `email`, `token` (unique UUID), `accepted_at`, `created_by`.
- **Table `company_invite_permissions`:** `invite_id`, `permission_key`.
- **Table `portal_users`:** `id`, `company_id`, `user_id` (FK → `auth.users`), `email`, `created_at`. Unique on `(company_id, user_id)`. Portal-only users — no dashboard permissions.
- **Table `portal_invites`:** `id`, `company_id`, `email`, `token` (UUID, unique), `expires_at`, `accepted_at`, `created_at`.

## Acceptance Criteria
- [ ] A request with an expired JWT returns HTTP 401.
- [ ] JWKS is fetched once and cached; subsequent requests reuse the cache.
- [ ] Invite sign-up joins existing company and assigns only invited permissions.
- [ ] A user without `page.portal` cannot access `PortalEdit` page (redirected + toast).
- [ ] `get_optional_user` returns `None` for requests without an `Authorization` header.
