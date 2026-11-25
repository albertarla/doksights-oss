# ADR-004: Company-Centric Auth Architecture Refactor

> **Rule of thumb:** Data belongs to a company (`company_id`, set by trigger), never a user; access checks go through `company_users` membership plus `company_user_permissions`; `profiles` stays a thin identity table.

**Date:** 2026-03-08 | **Status:** Accepted

**Context:** The original system had ownership tracked via `user_id` columns on `manuals` and `folders`, and `profiles` carried legacy portal fields (`portal_enabled`, `company_name`, `company_slug`). With the move to multi-tenant company-based authentication, these fields became inconsistent. The `company_users` table also lacked a `role` field, making it impossible to distinguish admin vs. regular member at the data level.

**Decision:**
- Drop `user_id` from `manuals` and `folders`; ownership is now exclusively via `company_id` (set by trigger).
- Make `manual_views.user_id` nullable (views are for analytics, not access control).
- Add `role` column to `company_users` (`admin` | `member`, default `member`; existing first-signup user backfilled as `admin`).
- Strip `profiles` to a thin identity table: only `id`, `email`, `created_at`, `updated_at`.
- Update `handle_new_user()` and `ensure_company_membership()` DB functions to set `role = 'admin'` for the account creator.

**Consequences:** Simpler data model — every access check flows through `company_users` membership and `company_user_permissions`. The `role` field is UI-visible in `CompanyUsers.tsx` and is the foundation for future license enforcement. No data loss; columns were nullable or had defaults before removal.
