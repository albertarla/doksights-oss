# User Management
**Status:** Stable
**Last Updated:** 2026-03-08
**Related ADR:** ADR-004

## Objective
Allow company admins to invite new team members by email, assign granular page-level permissions per user, and manage member status (active/disabled).

## User Stories
- As an admin, I want to invite a user by email and pre-assign permissions, so that they join the right company with the right access.
- As an admin, I want to edit a member's permissions post-invite, so that access can be adjusted over time.
- As a company admin, I want to remove users from my company so that they no longer have access to our manuals and are deleted from the system.
- As an admin, I want to see all pending invites and revoke them, so that I can manage outstanding access.

## Functional Requirements
- Requires `page.users` permission. Unauthorized users are redirected to `/dashboard`.
- **Invite flow:**
  1. Admin enters email and selects one or more permissions.
  2. A `company_invites` row is inserted with a UUID `token`.
  3. A corresponding `company_invite_permissions` row is inserted per selected permission.
  4. A shareable invite link (`/auth?invite={token}`) is generated and copyable.
  5. When the invited user signs up, the DB `handle_new_user` trigger detects the token and joins them to the company with the pre-assigned permissions.
- **Member management:**
  - View all `company_users` with their email (from `profiles`), role badge, and permissions (from `company_user_permissions`).
  - Edit permissions: diff-based update (add/remove individual rows from `company_user_permissions`).
  - Admin can remove a user.
  - Removed user is deleted from `auth.users` and cannot log in.
  - Admin cannot remove themselves.
- **Invite management:**
  - View all `company_invites` with pending/accepted status.
  - Copy an invite link.
  - Revoke (delete) a pending invite.
- Summary stats displayed: Total Members, Active Members, Pending Invites.

## API Surface

> All operations are performed directly via Supabase client, gated by RLS (`page.users` permission).

| Table | Operations | Description |
| :--- | :--- | :--- |
| `company_users` | SELECT | List members |
| `delete_user` | RPC | Delete a user from the system. | `target_user_id (uuid)` |
| `company_user_permissions` | SELECT, INSERT, DELETE | Read and manage member permissions |
| `company_invites` | SELECT, INSERT, DELETE | List, create, and revoke invites |
| `company_invite_permissions` | SELECT, INSERT | Permissions to pre-assign on invite |
| `profiles` | SELECT | Resolve `user_id` → email |

## Data Model

- The system relies on the `public.company_users` table for membership and the `auth.users` table for authentication. Removing a user deletes them from both, cascading to `profiles` and `company_user_permissions`.
- **Table `company_users`:** `id`, `company_id`, `user_id`, `role` (`admin` | `member`), `status` (`active` | `invited`), `created_by`.
- **Table `company_user_permissions`:** `company_user_id`, `permission_key` (FK → `permissions.key`). Unique per pair.
- **Table `company_invites`:** `id`, `company_id`, `email`, `token` (unique), `accepted_at`, `accepted_by`, `created_by`.
- **Table `company_invite_permissions`:** `invite_id`, `permission_key`.
- This displays a table of all active members and their `role` (Admin/Member).
  - **Role Enforcement:** Only an `admin` can promote or demote other users, and `admin` users are protected from deletion by regular `member` users. An `admin` cannot demote themselves if they are the only remaining admin.
  - Users with `page.users` permission can access this view. For each user, their explicit permissions (e.g., `page.analytics`, `page.manuals`) are shown.
- **Table `permissions`:** Static lookup of valid permission keys. Values: `page.analytics`, `page.users`, `page.portal`, `page.manuals`.

## Acceptance Criteria
- [ ] Admin can invite a user by email with selected permissions and receive a shareable link.
- [ ] Invite link contains the correct token and points to `/auth?invite={token}`.
- [ ] Editing member permissions performs a diff-update (removes only revoked, adds only new).
- [ ] Admin can remove a user.
- [ ] Removed user is deleted from `auth.users` and cannot log in.
- [ ] Admin cannot remove themselves.
- [ ] Revoking a pending invite deletes the `company_invites` row.
- [ ] A user without `page.users` is redirected to `/dashboard` with an error toast.
