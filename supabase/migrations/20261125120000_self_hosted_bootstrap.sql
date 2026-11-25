-- =====================================================================
-- Self-hosted bootstrap
--
-- Earlier migrations were pulled from a hosted database, so they assume
-- data and storage buckets that already existed there. This migration
-- makes a brand-new project usable:
--   1. creates the `manuals` and `company-logos` storage buckets
--   2. seeds the permission keys the app checks
--   3. seeds a single "Self-hosted" license with effectively no limits
--   4. assigns that license to any company that has none (now and later)
--   5. turns the very first user who signs up into the instance admin,
--      with their own workspace (company) and every permission
--
-- Everything is idempotent and safe to run on an existing database:
-- step 5 only fires when the new user is the first profile ever created.
-- =====================================================================

-- 1. Storage buckets ---------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('manuals', 'manuals', false, 52428800, ARRAY['application/pdf']),
  ('company-logos', 'company-logos', true, 5242880,
     ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- 2. Permission keys ---------------------------------------------------
INSERT INTO public.permissions (key, description, category)
VALUES
  ('page.manuals',   'Create, edit and publish manuals',        'pages'),
  ('page.users',     'Invite and manage workspace users',       'pages'),
  ('page.analytics', 'View analytics and AI chat insights',     'pages'),
  ('page.portal',    'Configure the public documentation portal','pages')
ON CONFLICT (key) DO NOTHING;

-- 3. Default license ---------------------------------------------------
-- Numeric limits are NOT NULL in the schema and compared in the UI, so use a
-- very large number instead of NULL. max_ai_tokens NULL already means unlimited.
INSERT INTO public.licenses (name, max_manuals, max_public_manuals, max_users, max_ai_tokens, features)
SELECT 'Self-hosted', 1000000, 1000000, 1000000, NULL, '{"analytics": true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.licenses WHERE name = 'Self-hosted');

CREATE OR REPLACE FUNCTION public.default_license_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.licenses WHERE name = 'Self-hosted' ORDER BY created_at LIMIT 1;
$$;

ALTER FUNCTION public.default_license_id() OWNER TO postgres;

-- 4. Auto-assign the default license -----------------------------------
INSERT INTO public.company_licenses (company_id, license_id, subscription_status)
SELECT c.id, public.default_license_id(), 'active'
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.company_licenses cl WHERE cl.company_id = c.id)
  AND public.default_license_id() IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_default_license()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.default_license_id() IS NOT NULL THEN
    INSERT INTO public.company_licenses (company_id, license_id, subscription_status)
    VALUES (NEW.id, public.default_license_id(), 'active')
    ON CONFLICT (company_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.assign_default_license() OWNER TO postgres;

DROP TRIGGER IF EXISTS assign_default_license_on_company ON public.companies;
CREATE TRIGGER assign_default_license_on_company
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.assign_default_license();

-- 5. First user becomes instance admin with a workspace -----------------
CREATE OR REPLACE FUNCTION public.bootstrap_first_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_company_user_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id <> NEW.id) THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles SET is_superadmin = true WHERE id = NEW.id;

  INSERT INTO public.companies (name, slug)
  VALUES ('My workspace', public.generate_company_slug('My workspace'))
  RETURNING id INTO v_company_id;

  INSERT INTO public.company_users (company_id, user_id, status, role, created_by)
  VALUES (v_company_id, NEW.id, 'active', 'admin', NEW.id)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_company_user_id;

  IF v_company_user_id IS NOT NULL THEN
    INSERT INTO public.company_user_permissions (company_user_id, permission_key)
    SELECT v_company_user_id, p.key FROM public.permissions p
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.bootstrap_first_user() OWNER TO postgres;

DROP TRIGGER IF EXISTS bootstrap_first_user_on_profile ON public.profiles;
CREATE TRIGGER bootstrap_first_user_on_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_first_user();
