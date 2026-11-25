# Superadmin Dashboard
**Status:** Stable
**Last Updated:** 2026-03-15
**Related ADR:** ADR-006

## Objective
A dedicated, protected interface for platform owners and support staff to visually manage all tenants (companies), monitor system usage, handle data support queries, and overview system health across the entire application.

## User Stories
- As a platform owner, I want to see a list of all companies so I can know how many tenants are currently using the service.
- As a platform owner, I want to manage License templates (max users, max manuals, features) and assign them to companies.
- As a platform owner, I want to provision new Companies and create their initial admin account in one step.
- As a platform owner, I want to view and change the assigned license for an existing company.
- As a support agent, I want to bypass standard tenant restrictions so I can troubleshoot issues for any user or manual globally.

## Functional Requirements
- Global read and write access to all core tables (`companies`, `profiles`, `company_users`, `manuals`, `folders`, `licenses`, `company_licenses`) at the database level.
- A secured routing guard on the frontend (`/superadmin` route) accessible only to users with the `is_superadmin` profile flag.
- Display aggregated platform metrics: Total Companies, Total Users, Total Manuals.
- Detailed, paginated or searchable list showing active states, selected license, and metrics per company.
- Ability to view and modify the assigned license for any existing company directly from the tenants table.
- A "Licenses" tab to CRUD system-wide license templates.
- A "New Company" action that creates the company, links the license, and provisions the initial admin user.

## API Surface
- **FastAPI Endpoints (`backend/app/routers/superadmin.py`)**: Secured behind `is_superadmin()` checks, providing:
  - `GET`, `POST`, `PUT`, `DELETE` operations for `/superadmin/licenses`.
  - `POST /superadmin/companies` for atomic company/admin provisioning.

## Data Model
- **Table `profiles`:** Gained the `is_superadmin` boolean flag (default `false`).
- **Table `licenses`:** Blueprint for feature limits (`id`, `name`, `max_manuals`, `max_users`, `features`).
- **Table `company_licenses`:** Maps `company_id` to `license_id`.
- **RLS Policies:** Explicit `FOR SELECT`, `FOR UPDATE`, and `FOR DELETE` policies have been added for all major tables authorizing users who meet `is_superadmin(auth.uid()) = true`.

## Acceptance Criteria
- [x] Setting `is_superadmin` to `true` for an account grants them access to view all companies globally on `/superadmin`.
- [x] Standard users receive a redirect to `/dashboard` when trying to hit `/superadmin`.
- [x] Superadmin can create a new license limit template.
- [x] Superadmin can provision a new company and assign it a license.
- [x] Superadmin can change the assigned license of an existing company.
