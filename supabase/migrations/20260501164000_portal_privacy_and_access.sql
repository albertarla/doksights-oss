-- ============================================================
-- Migration: Portal Privacy & Access Control
-- Adds portal_privacy to companies, creates portal_users and
-- portal_invites tables, and extends handle_new_user() to
-- handle portal invite sign-ups.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Add portal_privacy column to companies
-- ------------------------------------------------------------
ALTER TABLE "public"."companies"
  ADD COLUMN IF NOT EXISTS "portal_privacy" TEXT NOT NULL DEFAULT 'public'
    CHECK ("portal_privacy" IN ('public', 'private'));


-- ------------------------------------------------------------
-- 2. Create portal_users table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."portal_users" (
  "id"         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID        NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
  "user_id"    UUID        NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "email"      TEXT        NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("company_id", "user_id"),
  UNIQUE ("company_id", "email")
);

ALTER TABLE "public"."portal_users" OWNER TO "postgres";


-- ------------------------------------------------------------
-- 3. Create portal_invites table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."portal_invites" (
  "id"          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"  UUID        NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
  "email"       TEXT        NOT NULL,
  "token"       UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "created_by"  UUID        REFERENCES "auth"."users"("id") ON DELETE SET NULL,
  "accepted_at" TIMESTAMPTZ,
  "expires_at"  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("company_id", "email")
);

ALTER TABLE "public"."portal_invites" OWNER TO "postgres";


-- ------------------------------------------------------------
-- 4. Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "idx_portal_users_company_id"
  ON "public"."portal_users" ("company_id");

CREATE INDEX IF NOT EXISTS "idx_portal_users_user_id"
  ON "public"."portal_users" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_portal_invites_token"
  ON "public"."portal_invites" ("token");

CREATE INDEX IF NOT EXISTS "idx_portal_invites_company"
  ON "public"."portal_invites" ("company_id");


-- ------------------------------------------------------------
-- 5. Enable Row Level Security
-- ------------------------------------------------------------
ALTER TABLE "public"."portal_users"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."portal_invites" ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 6. RLS policies — portal_users
-- ------------------------------------------------------------

-- A portal user can always see their own row
CREATE POLICY "portal_users_self_select"
  ON "public"."portal_users"
  FOR SELECT
  USING ("user_id" = auth.uid());

-- Company members (admins) can view all portal users for their company
CREATE POLICY "portal_users_admin_select"
  ON "public"."portal_users"
  FOR SELECT
  USING ("public"."is_company_member"("company_id"));

-- Company members can add portal users to their company
CREATE POLICY "portal_users_admin_insert"
  ON "public"."portal_users"
  FOR INSERT
  WITH CHECK ("public"."is_company_member"("company_id"));

-- Company members can remove portal users from their company
CREATE POLICY "portal_users_admin_delete"
  ON "public"."portal_users"
  FOR DELETE
  USING ("public"."is_company_member"("company_id"));

-- Superadmins have full access
CREATE POLICY "portal_users_superadmin"
  ON "public"."portal_users"
  FOR ALL
  USING ("public"."is_superadmin"(auth.uid()))
  WITH CHECK ("public"."is_superadmin"(auth.uid()));


-- ------------------------------------------------------------
-- 7. RLS policies — portal_invites
-- ------------------------------------------------------------

-- Company members can manage invites for their own company
CREATE POLICY "portal_invites_admin_all"
  ON "public"."portal_invites"
  FOR ALL
  USING ("public"."is_company_member"("company_id"))
  WITH CHECK ("public"."is_company_member"("company_id"));

-- Superadmins have full access
CREATE POLICY "portal_invites_superadmin"
  ON "public"."portal_invites"
  FOR ALL
  USING ("public"."is_superadmin"(auth.uid()))
  WITH CHECK ("public"."is_superadmin"(auth.uid()));


-- ------------------------------------------------------------
-- 8. Grants
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."portal_users"   TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."portal_invites" TO "authenticated";


-- ------------------------------------------------------------
-- 9. Helper: is_portal_user(p_company_id)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."is_portal_user"("p_company_id" uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.company_id = p_company_id
      AND pu.user_id = auth.uid()
  );
$$;

ALTER FUNCTION "public"."is_portal_user"("p_company_id" uuid) OWNER TO "postgres";


-- ------------------------------------------------------------
-- 10. Helper: get_portal_invite_context(invite_token)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."get_portal_invite_context"("invite_token" uuid)
  RETURNS TABLE (
    "invite_id"    uuid,
    "company_id"   uuid,
    "company_name" text,
    "company_slug" text,
    "email"        text,
    "expires_at"   timestamptz,
    "accepted_at"  timestamptz
  )
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'public'
AS $$
  SELECT
    pi.id          AS invite_id,
    pi.company_id  AS company_id,
    c.name         AS company_name,
    c.slug         AS company_slug,
    pi.email       AS email,
    pi.expires_at  AS expires_at,
    pi.accepted_at AS accepted_at
  FROM public.portal_invites pi
  JOIN public.companies c ON c.id = pi.company_id
  WHERE pi.token = invite_token;
$$;

ALTER FUNCTION "public"."get_portal_invite_context"("invite_token" uuid) OWNER TO "postgres";


-- ------------------------------------------------------------
-- 11. Update handle_new_user() to handle portal invite flow
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."handle_new_user"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id          UUID;
  v_invite_token        TEXT;
  v_invite_record       RECORD;
  v_portal_invite_id    UUID;
  v_invite_email        TEXT;
BEGIN
  -- Extract company invite token from metadata (if present)
  v_invite_token := NEW.raw_user_meta_data->>'invite_token';

  -- Always insert a thin profile row first
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  IF v_invite_token IS NOT NULL THEN
    -- ── Company invite flow ───────────────────────────────────
    SELECT ci.id, ci.company_id
    INTO v_invite_record
    FROM public.company_invites ci
    WHERE ci.token = v_invite_token
      AND ci.accepted_at IS NULL
    LIMIT 1;

    IF v_invite_record IS NULL THEN
      -- Fallback: match by email
      SELECT ci.id, ci.company_id
      INTO v_invite_record
      FROM public.company_invites ci
      WHERE ci.email = NEW.email
        AND ci.accepted_at IS NULL
      LIMIT 1;
    END IF;

    IF v_invite_record IS NOT NULL THEN
      v_company_id := v_invite_record.company_id;

      INSERT INTO public.company_users (company_id, user_id, status, role, created_by)
      VALUES (v_company_id, NEW.id, 'active', 'member', NULL)
      ON CONFLICT (user_id) DO NOTHING;

      -- Grant only the permissions specified in the invite
      INSERT INTO public.company_user_permissions (company_user_id, permission_key)
      SELECT cu.id, cip.permission_key
      FROM public.company_users cu
      CROSS JOIN public.company_invite_permissions cip
      WHERE cu.user_id = NEW.id
        AND cip.invite_id = v_invite_record.id
      ON CONFLICT DO NOTHING;

      -- Mark invite as accepted
      UPDATE public.company_invites
      SET accepted_at = NOW(), accepted_by = NEW.id
      WHERE id = v_invite_record.id;
    END IF;

  ELSIF NEW.raw_user_meta_data->>'portal_invite_token' IS NOT NULL THEN
    -- ── Portal invite flow ────────────────────────────────────
    SELECT pi.id, pi.company_id, pi.email
      INTO v_portal_invite_id, v_company_id, v_invite_email
      FROM public.portal_invites pi
     WHERE pi.token = (NEW.raw_user_meta_data->>'portal_invite_token')::uuid
       AND pi.accepted_at IS NULL
       AND pi.expires_at > now();

    IF v_portal_invite_id IS NOT NULL THEN
      INSERT INTO public.portal_users (company_id, user_id, email)
      VALUES (v_company_id, NEW.id, v_invite_email)
      ON CONFLICT (company_id, user_id) DO NOTHING;

      UPDATE public.portal_invites
         SET accepted_at = NOW()
       WHERE id = v_portal_invite_id;
    END IF;

  END IF;

  -- If not invited via either flow, the user simply exists with a profile
  -- and zero companies/portals until provisioned manually.

  RETURN NEW;
END;
$function$;

ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";
