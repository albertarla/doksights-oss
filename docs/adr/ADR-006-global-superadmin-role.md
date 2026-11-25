# ADR-006: Global Superadmin Role

> **Rule of thumb:** Instance admins are `profiles.is_superadmin` (checked with `is_superadmin()`), with their own RLS override policies; never make them company members; `company_users.role` stays tenant-scoped.

**Date:** 2026-03-13 | **Status:** Accepted

**Context:** Platform administrators need the ability to see and manage all tenants (companies), users, and manuals across the application to handle billing, licensing, and support without being constrained by tenant-level RLS policies. It is impractical for a superadmin to be a `company_user` member of every single tenant.

**Decision:** 
- Add an `is_superadmin` boolean field to the `profiles` table.
- Implement a `is_superadmin(user_id)` database function to check the status.
- Add `OR is_superadmin(auth.uid())` equivalents via separate RLS policies (e.g., `FOR SELECT USING (is_superadmin())` and `FOR UPDATE ...`) across core tables (`profiles`, `companies`, `company_users`, `manuals`, `folders`, `manual_views`) so superadmins bypass normal tenant isolation.
- Develop a protected `/superadmin` root-level route in the frontend that is only accessible if `isSuperadmin` is true in `AuthContext`.

**Consequences:** 
- Keep the `company_users.role` specific to intra-tenant administration (`admin` vs `member`). Only system owners have `is_superadmin = true`.
- RLS complexity slightly increases due to extra policies for superadmin overrides.
- Allows the addition of a backend/support backoffice for easy data visualization and manipulation.
