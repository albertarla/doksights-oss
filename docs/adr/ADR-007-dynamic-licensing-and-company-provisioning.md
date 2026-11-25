# ADR-007: Dynamic Licensing and Company Provisioning

> **Rule of thumb:** Limits and feature gates are rows in `licenses` / `company_licenses`, enforced by Postgres triggers and read by the UI through `AuthContext`; never hardcode a limit. (Sign-up and provisioning are amended by ADR-012.)

**Date:** 2026-03-13 | **Status:** Accepted (amended by ADR-012)

**Context:** We need to enforce limits (users, manuals, public manuals) and gate features (analytics) dynamically based on what the company pays for. Previously, the system used public sign-ups creating isolated workspaces.

**Decision:** 
- Transition to a Superadmin-provisioned model: Public sign-ups are disabled. All companies and their initial admins are provisioned by superadmins via `/superadmin` dashboard endpoints.
- Introduce `licenses` table holding the quota rules (templates), and a `company_licenses` association table.
- Enforce constraints using PostgreSQL triggers (`enforce_user_limit`, `enforce_manual_limit`, `enforce_public_manual_limit`) to ensure data integrity regardless of the API entry point.
- Gate frontend features using `AuthContext` enriched with license features (e.g., `license.features.analytics`).

**Consequences:** 
- Strict control over company creation prevents abuse.
- Direct limit references mean updating a license template updates all associated companies globally.
- Error toasts/dialogs appear in the UI when limits are hit, improving discoverability over silently disabled buttons.

**Amended by [ADR-012](./ADR-012-self-hosted-bootstrap.md):** public sign-up is open again for the open-source edition. The first account becomes instance admin, and every company gets the default "Self-hosted" license automatically.
