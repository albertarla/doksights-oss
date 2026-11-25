# ADR-012: Self-Hosted Bootstrap and Open Sign-Up

> **Rule of thumb:** Migrations alone must make a fresh Supabase project usable (storage buckets, permission keys, a default "Self-hosted" license auto-assigned to every company); the first account becomes instance admin with a workspace; bootstrap SQL stays idempotent and safe on existing databases.

**Date:** 2026-11-25 | **Status:** Accepted

**Context:** DokSights is now open source and self-hosted. The earlier migrations were pulled from the hosted production database, so they assumed data that only existed there: the `manuals` and `company-logos` buckets, the permission keys, the license rows and a hand-promoted superadmin. A fresh `supabase start` produced an app where uploads failed and no one could administer anything. ADR-007's "public sign-ups are disabled, superadmins provision every company" model also assumes an operator who runs the service for paying customers.

**Decision:**
- Migration `20261125120000_self_hosted_bootstrap.sql` creates the missing buckets, seeds the four `page.*` permission keys, and seeds one "Self-hosted" license (very large numeric limits, `max_ai_tokens` NULL = unlimited, `analytics` on).
- An `AFTER INSERT` trigger on `companies` (`assign_default_license`) gives every new company that license unless one is set.
- An `AFTER INSERT` trigger on `profiles` (`bootstrap_first_user`) makes the very first account instance admin (`is_superadmin`) and creates "My workspace" with every permission. It does nothing once any other profile exists.
- Sign-up from `/auth` is open. Later users join through company or portal invites; uninvited sign-ups get an account with no workspace until an admin adds them.
- Superadmin provisioning keeps working; choosing a license is optional.

**Consequences:**
- `supabase start` (or `supabase db push` on a new project) gives a working instance with no manual SQL.
- Everything in the migration is idempotent, so it can also run on an existing database without changing existing admins or licenses.
- Limits remain data (ADR-007): operators who host workspaces for others create stricter licenses in the Superadmin screen.
- Related feature: [authentication.md](../functionalities/authentication.md).
