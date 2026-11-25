# Private Portals & Portal User Management

## Goal
Enable companies to restrict access to their public portals. Currently, portals are accessible to anyone with the URL. This change allows admins to toggle between "Public" and "Private" access and manage a list of authorized "Portal Users" who can log in to view the documentation without having full platform access.

## Key Decisions

> [!IMPORTANT]
> **Portal User Identity**: Portal users share the same `auth.users` table as platform users. They are distinguished by the absence of a `company_users` row for any active company — only a `portal_users` row exists. If someone is both a platform member and a portal user for a different company, they use the same credentials.
>
> **Invite vs. Direct Add**: If the invited email is NOT already an `auth.users` account, an email is sent via Resend with a sign-up link (`/auth?portal_invite={token}`). If the email IS already a registered user (platform or portal), they are added directly to `portal_users` with no sign-up required.
>
> **Portal-Only Protection**: Portal-only users must not reach `/dashboard`. A `DashboardRoute` wrapper in `App.tsx` enforces this by checking for `companyUserId` in `AuthContext`. If absent (and not superadmin), the user sees an inline "No dashboard access" message — NOT a redirect to `/auth` (which would create a redirect loop with `Auth.tsx`'s own post-login redirect).
>
> **AI Chat on Private Portals**: The FastAPI backend is NOT change-free. Both `POST /api/v1/chat/discover` and `POST /api/v1/chat/stream` allow anonymous access by checking only `portal_enabled`, not `portal_privacy`. This is a security gap — if a portal is set to private, both endpoints still serve AI responses to anyone who knows the `company_slug` or `manual_id`. Both the `discovery.py` router and `supabase_service.get_public_manual_by_id()` must be updated to also check `portal_privacy`, requiring a valid JWT for private portals.
>
> **Login Page Branding**: `CompanyPortalLogin` does NOT call the Edge Function. It fetches branding directly via a Supabase client query on the `companies` table, which is a public read already permitted by existing RLS. No new endpoint is needed. The Edge Function's `401 PRIVATE_PORTAL` response includes the `slug` to enable the redirect, but branding data is fetched independently by the login page.

---

## Proposed Changes

### Database & Security

#### [NEW] Migration: `20260501164000_portal_privacy_and_access.sql`
_File_: `supabase/migrations/20260501164000_portal_privacy_and_access.sql`

**Schema additions:**

- Add `portal_privacy` column to `companies`:
  ```sql
  ALTER TABLE companies
    ADD COLUMN portal_privacy TEXT NOT NULL DEFAULT 'public'
    CHECK (portal_privacy IN ('public', 'private'));
  ```
  Use a `CHECK` constraint rather than a custom ENUM to stay consistent with the existing `manual_type` and `role` columns, which are all CHECK-constrained TEXTs.

- Create `portal_users` table:
  ```sql
  CREATE TABLE portal_users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, user_id),
    UNIQUE (company_id, email)
  );
  ```
  > Note: `email` is stored as a read-only denormalization for admin list display, avoiding a join to `auth.users` or `profiles`. It must match `auth.users.email` at insert time.

- Create `portal_invites` table:
  ```sql
  CREATE TABLE portal_invites (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    token       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, email)
  );
  ```
  > `expires_at` defaults to 7 days. The sign-up handler must reject tokens where `accepted_at IS NULL AND expires_at < now()`.

- **Indexes:**
  ```sql
  CREATE INDEX idx_portal_users_company_id ON portal_users(company_id);
  CREATE INDEX idx_portal_users_user_id    ON portal_users(user_id);
  CREATE INDEX idx_portal_invites_token    ON portal_invites(token);
  CREATE INDEX idx_portal_invites_company  ON portal_invites(company_id);
  ```

**RLS Policies:**

- Enable RLS on both tables:
  ```sql
  ALTER TABLE portal_users  ENABLE ROW LEVEL SECURITY;
  ALTER TABLE portal_invites ENABLE ROW LEVEL SECURITY;
  ```

- `portal_users` policies:
  ```sql
  -- Portal users can see their own row
  CREATE POLICY "portal_users_self_select"
    ON portal_users FOR SELECT
    USING (user_id = auth.uid());

  -- Company admins can see all portal users for their company
  CREATE POLICY "portal_users_admin_select"
    ON portal_users FOR SELECT
    USING (is_company_member(company_id));

  -- Only company admins can insert/delete portal users
  CREATE POLICY "portal_users_admin_insert"
    ON portal_users FOR INSERT
    WITH CHECK (is_company_member(company_id));

  CREATE POLICY "portal_users_admin_delete"
    ON portal_users FOR DELETE
    USING (is_company_member(company_id));

  -- Superadmin bypass
  CREATE POLICY "portal_users_superadmin"
    ON portal_users FOR ALL
    USING (is_superadmin(auth.uid()));
  ```

- `portal_invites` policies:
  ```sql
  -- Company admins manage invites for their company
  CREATE POLICY "portal_invites_admin_all"
    ON portal_invites FOR ALL
    USING  (is_company_member(company_id))
    WITH CHECK (is_company_member(company_id));

  -- Superadmin bypass
  CREATE POLICY "portal_invites_superadmin"
    ON portal_invites FOR ALL
    USING (is_superadmin(auth.uid()));
  ```

**Trigger update — `handle_new_user()`:**

The existing trigger creates a company for every new user without an `invite_token`. Add a branch for `portal_invite_token`:

```sql
-- Inside handle_new_user(), after the company_invite branch:
ELSIF raw_meta->>'portal_invite_token' IS NOT NULL THEN
  -- Find the invite
  SELECT pi.id, pi.company_id, pi.email
    INTO v_portal_invite_id, v_company_id, v_invite_email
    FROM portal_invites pi
   WHERE pi.token = (raw_meta->>'portal_invite_token')::uuid
     AND pi.accepted_at IS NULL
     AND pi.expires_at  > now();

  IF v_portal_invite_id IS NOT NULL THEN
    -- Insert portal_users row
    INSERT INTO portal_users (company_id, user_id, email)
    VALUES (v_company_id, NEW.id, v_invite_email)
    ON CONFLICT (company_id, user_id) DO NOTHING;

    -- Mark invite accepted
    UPDATE portal_invites
       SET accepted_at = now()
     WHERE id = v_portal_invite_id;
  END IF;
  -- Do NOT create a new company. Portal users are not tenants.
END IF;
```

> **Critical**: The `ELSIF` ordering matters. The existing `invite_token` branch runs first. The `portal_invite_token` branch must be checked before the final `ELSE` branch that creates a new company. If neither token is present, the ELSE branch fires as before.

**DB Helper Function:**

Add `is_portal_user(p_company_id uuid)` for use in RLS policies and Edge Function:
```sql
CREATE OR REPLACE FUNCTION is_portal_user(p_company_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portal_users
     WHERE company_id = p_company_id
       AND user_id    = auth.uid()
  );
$$;
```

---

### Backend (Edge Function)

#### [MODIFY] `supabase/functions/get-company-portal/index.ts`

1. **Fetch `portal_privacy`** in the company SELECT query.

2. **If `portal_privacy === 'private'`:**

   a. Extract `Authorization: Bearer <jwt>` header.

   b. If missing → return `401 { error: 'PRIVATE_PORTAL', slug: companySlug }`.
   > Include `slug` so the frontend can build the login redirect URL without an extra fetch.

   c. Verify the JWT. Use `supabase.auth.getUser(token)` — this performs server-side validation against Supabase's JWKS and returns the user object. Reject expired or malformed tokens with `401`.

   d. Check access: query `portal_users` OR `company_users` for the resolved `userId` and `company.id`.
   ```typescript
   const { data: accessCheck } = await supabase
     .from('portal_users')
     .select('id')
     .eq('company_id', company.id)
     .eq('user_id', userId)
     .maybeSingle();

   const { data: memberCheck } = await supabase
     .from('company_users')
     .select('id')
     .eq('company_id', company.id)
     .eq('user_id', userId)
     .eq('status', 'active')
     .maybeSingle();

   if (!accessCheck && !memberCheck) {
     return new Response(
       JSON.stringify({ error: 'PORTAL_ACCESS_DENIED' }),
       { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
   }
   ```
   > Return `403` (not `401`) for "authenticated but not authorized" to allow the frontend to show a meaningful "You don't have access" message instead of a login redirect loop.

3. **`supabase.functions.invoke()` in the frontend** automatically attaches the active Supabase session's JWT to the `Authorization` header, so no frontend change is needed to pass the token.

4. **CORS**: Keep `*` for `Access-Control-Allow-Origin`. Portal login flows are same-origin.

5. **Rate Limiting Note**: The in-memory rate limiter is per-Deno-instance. This is acceptable for now. For production hardening, consider switching to a Supabase KV or Redis-backed limiter. Document this in `architecture.md` scalability section.

---

### Backend (FastAPI) — Private Portal Access Enforcement

#### [MODIFY] `backend/app/services/supabase_service.py` — `get_public_manual_by_id()`

This function is called by both `chat.py` (anonymous branch) and `analytics.py`. It currently checks `portal_enabled` but not `portal_privacy`. Update the company query to also fetch `portal_privacy`:

```python
company_response = await client.table("companies").select(
    "portal_enabled, portal_privacy"
).eq("id", company_id).single().execute()

company = company_response.data
if not company or not company.get("portal_enabled"):
    return None

# Return the manual together with portal_privacy so callers can enforce access
manual["portal_privacy"] = company.get("portal_privacy", "public")
return manual
```

#### [MODIFY] `backend/app/routers/chat.py` — `chat_stream()` anonymous branch

The anonymous fallback branch (no `user`, no `link_id`) calls `get_public_manual_by_id()`. After this change, the returned manual includes `portal_privacy`. Enforce it:

```python
else:
    manual = await supabase_service.get_public_manual_by_id(chat_request.manual_id)
    if manual and manual.get("portal_privacy") == "private":
        raise HTTPException(status_code=401, detail="Authentication required for this portal")
```

> This means a portal user who is logged in will have their JWT in the request, so `user` will be resolved via `get_optional_user` (not `None`), and they will land in the `if user:` branch — the anonymous branch is only hit by genuinely unauthenticated callers.

#### [MODIFY] `backend/app/routers/discovery.py` — `find_relevant_manuals_by_company()`

This function also only checks `portal_enabled`. Update the company query:

```python
company_result = await db.table("companies").select(
    "id, portal_privacy"
).eq("slug", company_slug).eq("portal_enabled", True).maybe_single().execute()

if not company_result.data:
    return [], 0

# Return privacy flag alongside data
return company_result.data["id"], company_result.data.get("portal_privacy", "public")
```

Update the `discover_manuals` endpoint to enforce privacy. The endpoint already accepts `user: Optional[JWTPayload]` via `get_optional_user`. If the company is private and `user` is None, reject the request:

```python
if mode == "public":
    company_id, portal_privacy = await find_relevant_manuals_by_company(...)
    if portal_privacy == "private" and not user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required for this portal"
        )
    # proceed with the slug-based discovery
```

> A logged-in portal user calling `/api/v1/chat/discover` will have their JWT parsed by `get_optional_user`, so `user` will not be `None`. The check only blocks truly anonymous callers.

#### Summary of affected backend files

| File | Change |
| :--- | :--- |
| `supabase_service.py` | `get_public_manual_by_id()`: also fetch and return `portal_privacy` |
| `chat.py` | Anonymous branch: reject if `portal_privacy == 'private'` |
| `discovery.py` | `find_relevant_manuals_by_company()`: also return `portal_privacy`; `discover_manuals()`: reject anonymous if private |

---

### Backend (FastAPI) — Portal Invite Email

#### [NEW] `POST /api/v1/portal/invite` endpoint (or Supabase RPC)

When an admin invites a new portal user (email not found in `auth.users`):

1. Insert into `portal_invites` (via Supabase client RLS, admin-only).
2. Call a new FastAPI endpoint `POST /api/v1/portal/send-invite`:
   - Input: `{ company_id, invite_token, email, company_name }`
   - Auth: company admin JWT.
   - Uses `NotificationService` (Resend) to send a branded email:
     - Subject: "You've been invited to access [Company Name]'s documentation portal"
     - Body: Portal sign-up link: `{FRONTEND_URL}/auth?portal_invite={token}`
     - Include the company logo and name in the email.

> **Alternatively**, if adding a FastAPI endpoint is undesirable, the email can be sent from a Supabase Edge Function `send-portal-invite`. Recommend FastAPI for consistency with the existing `notification_service.py`.

**When the invited email IS already a registered `auth.users` account:**
- Skip the invite flow entirely.
- Insert directly into `portal_users` (via Supabase client, RLS-gated).
- The admin sees a confirmation: "User added directly (existing account)."

---

### Frontend Components

#### [NEW] `frontend/src/components/dashboard/PortalUsersList.tsx`

Management UI for portal users.

**Features:**
- **Current users list:** Table showing email, `created_at`, and a "Remove" button.
  - Remove calls Supabase `DELETE FROM portal_users WHERE id = ...` (RLS-gated).
  - **Removal semantics**: Only the `portal_users` row is deleted. The user's `auth.users` account is preserved (they may be a platform user elsewhere). No `delete_user` RPC needed.
- **Pending invites list:** Table of `portal_invites` where `accepted_at IS NULL`, showing email, `expires_at`, expiry status badge, and "Revoke" button.
- **Invite form:**
  - Email input with validation.
  - On submit:
    1. Check `profiles` table for existing user by email.
    2. If found: INSERT directly into `portal_users` via Supabase client.
    3. If not found: INSERT into `portal_invites`, then call `POST /api/v1/portal/send-invite`.
  - Toast confirmation: "Invite sent to {email}" or "User {email} added."
- **Empty states** for each list.
- **Mobile responsive**: Stack lists vertically on small screens.

#### [MODIFY] `frontend/src/components/dashboard/PortalSettings.tsx`

- Fetch `portal_privacy` alongside existing fields.
- Add a **"Portal Access"** section between the Enable/Disable toggle and the Portal URL field:
  ```
  [ ] Public  — Anyone with the link can access
  [x] Private — Only invited users can access
  ```
  Use radio buttons or a `Select` component, not a second toggle (avoids confusion with the enable/disable toggle above it).
- **Conditional rendering:** If `portal_privacy === 'private'` AND `portal_enabled === true`, render `<PortalUsersList companyId={companyId} />` below the settings card.
- Save `portal_privacy` in the `handleSave` function alongside existing fields.
- Update the status message: "Your portal is live (private) — only invited users can access."

#### [NEW] `frontend/src/pages/CompanyPortalLogin.tsx`

Branded login page at `/company/:companySlug/login`.

**Responsibilities:**
- On mount: Fetch company branding from Supabase client directly:
  ```typescript
  supabase.from('companies')
    .select('name, logo_url, portal_primary_color, portal_background_color')
    .eq('slug', companySlug)
    .eq('portal_enabled', true)
    .single()
  ```
  This is a public read permitted by existing RLS.
- Apply `getThemeVariables()` for consistent branding.
- Show Email + Password form using `supabase.auth.signInWithPassword()`.
- On successful login:
  - Check if the user is a portal user for this company (query `portal_users`).
  - If yes: redirect to `/company/:companySlug`.
  - If no: show error "You do not have access to this portal."
  - If the user is also a company member, they have access too — redirect to portal.
- **If user is already authenticated** on mount: run the access check and redirect to portal immediately (skip login form).
- Include "Forgot password?" link pointing to `/auth?mode=forgot`.
- Do NOT include "Sign up" or "Request access" — portal users are invite-only.
- **Mobile responsive**: Full-screen centered card, same pattern as `Auth.tsx`.

#### [MODIFY] `frontend/src/pages/CompanyPortal.tsx`

- In the `supabase.functions.invoke()` error handler:
  ```typescript
  if (data?.error === 'PRIVATE_PORTAL') {
    navigate(`/company/${companySlug}/login`);
    return;
  }
  if (data?.error === 'PORTAL_ACCESS_DENIED') {
    setError('You do not have permission to access this portal.');
    return;
  }
  ```
- Add a `returnTo` query param when redirecting to login: `/company/${companySlug}/login?returnTo=${encodeURIComponent(window.location.pathname)}`.
- After successful login in `CompanyPortalLogin`, read `returnTo` and navigate there.

#### [MODIFY] `frontend/src/pages/Auth.tsx`

- Support `portal_invite` query parameter:
  ```typescript
  const portalInviteToken = searchParams.get('portal_invite')?.trim() || null;
  ```
- When `portalInviteToken` is present:
  1. Validate the token: call a new Supabase RPC `get_portal_invite_context(token)` that returns `{ company_id, company_name, email, expires_at, accepted_at }`.
  2. Show invite status banners identical in style to the existing company invite banners.
  3. On sign-up, pass `portal_invite_token` in `raw_user_meta_data`:
     ```typescript
     supabase.auth.signUp({ email, password, options: { data: { portal_invite_token: portalInviteToken } } })
     ```
  4. **Post-signup redirect**: Instead of navigating to `/dashboard`, navigate to `/company/:companySlug` (resolved from `company_name` → slug). Do NOT show "Redirecting to dashboard" toast.
- If both `invite` (company invite) and `portal_invite` are present, prioritize `invite` (company membership takes precedence).

**New RPC needed:**
```sql
CREATE OR REPLACE FUNCTION get_portal_invite_context(invite_token uuid)
RETURNS TABLE (
  invite_id    uuid,
  company_id   uuid,
  company_name text,
  company_slug text,
  email        text,
  expires_at   timestamptz,
  accepted_at  timestamptz
)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT pi.id, pi.company_id, c.name, c.slug, pi.email, pi.expires_at, pi.accepted_at
    FROM portal_invites pi
    JOIN companies c ON c.id = pi.company_id
   WHERE pi.token = invite_token;
$$;
```

#### [MODIFY] `frontend/src/App.tsx`

1. **Register the new route:**
   ```tsx
   <Route path="/company/:companySlug/login" element={<CompanyPortalLogin />} />
   ```
   Place it above the catch-all `*` route but BELOW `/company/:companySlug` to avoid route conflicts.

2. **Create a `DashboardRoute` wrapper:**

   > **Warning — do not redirect to `/auth`**. `Auth.tsx` redirects authenticated users to `/dashboard`. If `DashboardRoute` redirects portal-only users back to `/auth`, the result is an infinite redirect loop. Instead, render an inline access-denied state.

   ```tsx
   function DashboardRoute({ children }: { children: React.ReactNode }) {
     const { companyUserId, isSuperadmin, loading } = useAuth();
     if (loading) return <FullPageSpinner />;
     if (!companyUserId && !isSuperadmin) {
       return (
         <div className="flex min-h-screen items-center justify-center">
           <div className="text-center space-y-2">
             <h1 className="text-xl font-semibold">No dashboard access</h1>
             <p className="text-muted-foreground text-sm">
               Your account is not associated with a platform workspace.
             </p>
             <Button variant="outline" onClick={() => supabase.auth.signOut()}>
               Sign out
             </Button>
           </div>
         </div>
       );
     }
     return <>{children}</>;
   }
   ```
   Wrap all `/dashboard/*` routes:
   ```tsx
   <Route path="/dashboard" element={<DashboardRoute><Dashboard /></DashboardRoute>} />
   <Route path="/dashboard/portal" element={<DashboardRoute><PortalEdit /></DashboardRoute>} />
   <!-- etc. -->
   ```

---

### AuthContext & Auth.tsx — Redirect Loop Prevention

#### [MODIFY] `frontend/src/contexts/AuthContext.tsx`

No schema changes needed. Verify that a portal-only user (a user with a `portal_users` row but no `company_users` row) results in `companyUserId === null` after login — the existing `fetchUserData()` logic already behaves this way.

Add a derived flag for clarity and reuse:
```typescript
// Expose via context value
const isPortalOnlyUser = !!user && !loading && !companyUserId && !isSuperadmin;
```

#### [MODIFY] `frontend/src/pages/Auth.tsx` — post-login redirect

The current redirect effect is:
```typescript
useEffect(() => {
  if (!loading && user && !isRecovery) navigate('/dashboard');
}, [user, loading, navigate, mode]);
```

A portal-only user who signs in via this page would be redirected to `/dashboard`, hitting `DashboardRoute`'s "no access" wall and staying stuck. Fix by gating the redirect on `companyUserId` or `isSuperadmin`:

```typescript
const { user, loading, companyUserId, isSuperadmin } = useAuth();

useEffect(() => {
  const isRecovery = window.location.hash.includes('type=recovery') || mode === 'reset';
  if (!loading && user && !isRecovery) {
    if (companyUserId || isSuperadmin) {
      navigate('/dashboard');
    }
    // Portal-only users are not auto-redirected from this page.
    // They should use /company/:slug/login to sign in.
  }
}, [user, loading, navigate, mode, companyUserId, isSuperadmin]);
```

> This means a portal-only user who lands on `/auth` (e.g., via a "Forgot password" link) will stay on the auth page after password reset instead of being bounced between `/dashboard` and `/auth`. They can then navigate to their portal manually. Acceptable for V1.

---

### Notification (Email)

#### [NEW] `backend/app/routers/portal.py`

```python
POST /api/v1/portal/send-invite
Auth: company admin JWT (verified via verify_supabase_token)
Body: { company_id: str, invite_token: str, email: str, company_name: str, company_slug: str }
```

- Validates that the `invite_token` exists in `portal_invites` for the authenticated admin's company.
- Sends email via `NotificationService.send_portal_invite_email()`.
- Subject: "You've been invited to access {company_name}'s documentation"
- Body: Sign-up link + short instructions. Link: `{FRONTEND_URL}/auth?portal_invite={token}`.
- Returns `{ success: true }`.

---

### Documentation

#### [NEW] ADR-011: Portal User Architecture

Document the decision to reuse `auth.users` for portal-only users, the `portal_users` junction table approach, and the alternative considered (a separate `portal_auth` table with custom tokens). Consequences: simpler auth stack, shared password reset flow, requires explicit dashboard guard.

#### [MODIFY] `docs/architecture.md`

- Add `portal_users` and `portal_invites` to the **Database Schema** tables list.
- Add `is_portal_user()` to **Key Database Functions**.
- Update **Data Flow 4 (Public Portal Load)** to include the privacy check branch.
- Add a new **Data Flow 8: Private Portal Access** describing the auth check path.
- Update **RLS table** with `portal_users` and `portal_invites` policies.

#### [MODIFY] `docs/functionalities/company_portal.md`

- Update **Objective** to mention optional private access mode.
- Add User Stories for authenticated portal users.
- Add the private portal flow to **Functional Requirements**.
- Update **API Surface** with the `PRIVATE_PORTAL` / `PORTAL_ACCESS_DENIED` error codes.
- Update **Data Model** with `portal_privacy`, `portal_users`, `portal_invites`.

#### [MODIFY] `docs/functionalities/portal_settings.md`

- Add `portal_privacy` to **Functional Requirements** and **Data Model**.
- Add User Story for managing private portal and invited users.

#### [MODIFY] `docs/functionalities/authentication.md`

- Add portal invite sign-up flow as a variant of the existing invite flow.
- Document `portal_invite_token` in `raw_user_meta_data`.
- Document the `DashboardRoute` guard for portal-only users.

---

## Verification Plan

### Automated Tests

**Database:**
- Run migration and verify:
  - `portal_privacy` column defaults to `'public'`.
  - `portal_invites` token is unique.
  - `handle_new_user()` trigger inserts `portal_users` row and marks invite accepted.
  - Expired invite token is rejected by the trigger.
  - `is_portal_user()` function returns `true` for a user in `portal_users`.
  - RLS: company admin can read `portal_users`; random user cannot.

**Edge Function:**
- Mock a private portal and verify:
  - No token → `401 PRIVATE_PORTAL`.
  - Expired JWT → `401`.
  - Valid JWT, user not in `portal_users` or `company_users` → `403 PORTAL_ACCESS_DENIED`.
  - Valid JWT, user in `portal_users` → `200` with portal data.
  - Valid JWT, user is company member → `200` with portal data.
  - Valid JWT, user is company member of a *different* company → `403` (cross-company access denied).

**Backend (pytest):**
- `test_discover_private_portal_anonymous`: `POST /api/v1/chat/discover` with `company_slug` of a private portal and no token → `401`.
- `test_discover_private_portal_authenticated`: Same request with a valid portal-user JWT → `200` stream.
- `test_chat_stream_private_portal_anonymous`: `POST /api/v1/chat/stream` with a manual from a private portal and no token → `401`.
- `test_chat_stream_private_portal_authenticated`: Same request with portal-user JWT → `200` stream.
- `test_public_portal_still_anonymous`: Ensure public portals are unaffected — `POST /api/v1/chat/discover` with no token still works.

**Frontend (Vitest):**
- `PortalUsersList`: renders user list, pending invites, invite form.
- `CompanyPortalLogin`: renders branded login form; redirects if already authenticated.
- `CompanyPortal`: redirects to login on `PRIVATE_PORTAL`, shows error on `PORTAL_ACCESS_DENIED`.
- `DashboardRoute`: portal-only user (no `companyUserId`) sees "No dashboard access" screen, NOT a redirect.
- `Auth.tsx`: portal-only user sign-in does NOT trigger `navigate('/dashboard')`.
- `Auth.tsx`: handles `portal_invite` query param, shows correct banners, redirects to portal on signup.

### Manual Verification

1. Admin logs in → goes to Portal Settings → sets Privacy to "Private" → saves.
2. Opens portal in Incognito → should redirect to `/company/{slug}/login`.
3. Login page shows company branding (logo, colors).
4. Login with wrong credentials → error message.
5. Admin invites a NEW email as portal user → invite email received with sign-up link.
6. Follows invite link in Incognito → shows portal invite banner on Auth page with company name.
7. Creates account → is redirected to `/company/{slug}` (NOT `/dashboard`).
8. Navigates directly to `/dashboard` → is redirected to `/auth`.
9. Can browse portal, search manuals, open viewers, use AI chat.
10. Admin invites an EXISTING platform user → no email sent, user added directly.
11. Existing platform user logs in → can access both `/dashboard` and the portal.
12. Admin removes a portal user → user can no longer access the portal; their account still exists.
13. Admin revokes a pending invite → invite link no longer works.
14. Admin sets portal back to "Public" → Incognito can access without login.
15. Expired invite token → visiting the sign-up link shows "This invite has expired."

16. Portal user navigates directly to `/auth` and signs in → stays on `/auth` (no redirect loop, no dashboard bounce).
17. In Incognito, call `POST /api/v1/chat/discover` with the private company's slug and no token → `401` (not a 200 with AI response).
18. Same call with a valid portal-user JWT → streams AI discovery results normally.

### Regression Tests

- Public portal (no privacy change) still loads correctly.
- Anonymous AI discovery and chat still work on public portals.
- Company member can still access their own portal.
- Superadmin can access any portal regardless of privacy.
- Existing invite flow for company users (`/auth?invite={token}`) is unaffected.
- Analytics tracking still fires on portal views for both public and private portals.
- A company member of Company A cannot access a private portal for Company B (even with a valid JWT).
