# ADR-011: Private Portal Authentication Separation

> **Rule of thumb:** Portal-only users live in `portal_users` / `portal_invites`, never `company_users`; private portals are enforced in both the Edge Function and FastAPI chat/discovery; keep `handle_new_user()` branch order (company invite before portal invite).

**Date:** 2026-05-02 | **Status:** Accepted

**Context:** Companies need to restrict portal access to a defined list of external users (e.g., B2B clients, partners) without granting those users access to the internal dashboard. The existing auth system creates `company_users` on invite acceptance, which grants dashboard access. A separate identity class was needed for portal-only users.

**Decision:**
- Add `portal_privacy` column (`public` | `private`, default `public`) to `companies` using a `CHECK` constraint (consistent with existing `manual_type` and `role` patterns; avoids a separate ENUM type migration).
- Introduce two new tables: `portal_users` (active portal-only members) and `portal_invites` (pending invitations with expiry).
- The `handle_new_user()` DB trigger is extended with an `ELSIF portal_invite_token` branch that runs only when no `invite_token` is present, inserting into `portal_users` instead of `company_users`. The `ELSIF` ordering is critical.
- `DashboardRoute` in `App.tsx` renders an inline "no access" screen (not a redirect to `/auth`) for users with no `companyUserId` and no superadmin flag, breaking the redirect loop that portal-only users would otherwise trigger.
- Access enforcement is dual-layered: the Edge Function validates the Bearer token and checks `portal_users` OR `company_users`; FastAPI `chat.py` and `discovery.py` also reject anonymous callers on private portals. This prevents both direct portal access and indirect AI API access.
- HTTP 401 (no/invalid token) and HTTP 403 (authenticated but unauthorized) are handled differently on the frontend: 401 triggers a login redirect; 403 shows an inline error without redirect, preventing a loop for authenticated users without access.

**Consequences:**
- Portal-only users and dashboard users are cleanly separated at the data model level with no overlap.
- `CompanyPortalLogin.tsx` is a fully independent page with its own branding fetch, decoupled from `Auth.tsx`.
- Switching a portal from public to private does not affect any existing `company_users` rows.
- The `handle_new_user()` trigger now has three branches; branch ordering must be maintained on future changes.
