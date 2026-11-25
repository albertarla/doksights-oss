# Portal Settings
**Status:** Stable
**Last Updated:** 2026-05-06
**Related ADR:** ADR-011

## Objective
Allow admins with the `page.portal` permission to configure their company's portal appearance, control public/private access mode, and manage which external users are authorized to access a private portal.

## User Stories
- As an admin, I want to enable or disable my company's portal, so that I control whether it is accessible.
- As an admin, I want to choose between a public portal (no login) and a private portal (login required), so that I can control who accesses our documentation.
- As an admin, I want to set a custom logo, primary color, and background color, so that the portal reflects our brand.
- As an admin, I want to define a company slug, so that the portal URL is legible and branded.
- As an admin, I want to write a portal description, so that visitors understand what the portal is for.
- As an admin, I want to invite external users by email to access my private portal.
- As an admin, I want to remove a portal user or revoke a pending invite at any time.

## Functional Requirements
- Requires `page.portal` permission. Unauthorized users are redirected to `/dashboard`.
- Settings are managed via the `PortalSettings` component.
- Configurable fields:
  - `portal_enabled` (toggle) — enables/disables portal access entirely.
  - `portal_privacy` (radio: `public` | `private`) — controls access mode:
    - **Public**: no login required (existing behaviour).
    - **Private**: only authenticated users with a `portal_users` or `company_users` row can access.
  - `logo_url` — upload to `company-logos` Supabase Storage bucket (public bucket).
  - `portal_primary_color` — color picker for accent color.
  - `portal_background_color` — color picker for page background.
  - `portal_description` — free-text description shown in portal header.
  - `slug` — URL-safe company identifier (must be unique).
- **Portal User Management** (`PortalUsersList` component, visible only when `portal_privacy = 'private'` and `portal_enabled = true`):
  - **Invite by email**: if the email exists in `profiles`, the user is added directly to `portal_users`. Otherwise, a `portal_invites` row is created and an invite email is sent via `POST /api/v1/portal/send-invite`.
  - Invite email contains a branded sign-up link: `/auth?portal_invite={token}`.
  - Invites expire after 7 days (configurable via `expires_at`). Expired invites show an "Expired" badge.
  - Admins can remove authorized users (deletes from `portal_users`) or revoke pending invites (deletes from `portal_invites`).
- Logo storage policy: `page.portal` permission required to upload/update/delete from `company-logos` bucket.
- Company logo bucket is **public** (no signed URL needed for read).
- Changes are persisted to the `companies` table via Supabase client (RLS-gated by `page.portal`).

## API Surface

| Source | Method/Table | Auth | Description |
| :--- | :--- | :--- | :--- |
| Supabase client | `companies` SELECT, UPDATE | `page.portal` | Read and write portal settings |
| Supabase client | `portal_users` SELECT, INSERT, DELETE | `page.portal` | Manage authorized portal users |
| Supabase client | `portal_invites` SELECT, INSERT, DELETE | `page.portal` | Manage pending invitations |
| Supabase client | `storage.objects` (company-logos) | `page.portal` | Logo upload/replace/delete |
| FastAPI | POST `/api/v1/portal/send-invite` | Bearer JWT | Send invite email via Resend |

## Data Model

- **Table `companies`:** `portal_enabled`, `portal_privacy` (`public` | `private`, default `public`), `portal_description`, `logo_url`, `portal_primary_color`, `portal_background_color`, `slug`.
- **Table `portal_users`:** `id`, `company_id`, `user_id` (FK → `auth.users`), `email`, `created_at`. Unique on `(company_id, user_id)`. RLS: readable/writable by active company members.
- **Table `portal_invites`:** `id`, `company_id`, `email`, `token` (UUID, unique), `expires_at`, `accepted_at`, `created_at`. RLS: readable/writable by active company members.
- **Storage Bucket `company-logos`:** Public read. Write gated by `page.portal` permission.

## Acceptance Criteria
- [ ] Admin with `page.portal` can toggle portal on/off.
- [ ] Admin can switch between Public and Private portal mode.
- [ ] `PortalUsersList` is visible only when the portal is enabled and set to Private.
- [ ] Inviting an email that exists in `profiles` adds them directly to `portal_users` (no email sent).
- [ ] Inviting an unknown email creates a `portal_invites` row and triggers the invite email.
- [ ] Expired invites show an "Expired" badge in the pending invitations list.
- [ ] Removing a portal user deletes their `portal_users` row.
- [ ] Revoking an invite deletes the `portal_invites` row.
- [ ] Uploading a logo stores it in `company-logos` and updates `companies.logo_url`.
- [ ] Color picker changes persist to `portal_primary_color` and `portal_background_color`.
- [ ] Slug change is validated for uniqueness before save.
- [ ] A user without `page.portal` is redirected to `/dashboard` with an error toast.
