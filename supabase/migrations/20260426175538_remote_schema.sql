revoke delete on table "public"."manual_sections" from "anon";

revoke insert on table "public"."manual_sections" from "anon";

revoke references on table "public"."manual_sections" from "anon";

revoke trigger on table "public"."manual_sections" from "anon";

revoke truncate on table "public"."manual_sections" from "anon";

revoke update on table "public"."manual_sections" from "anon";

revoke delete on table "public"."web_manual_images" from "anon";

revoke insert on table "public"."web_manual_images" from "anon";

revoke references on table "public"."web_manual_images" from "anon";

revoke select on table "public"."web_manual_images" from "anon";

revoke trigger on table "public"."web_manual_images" from "anon";

revoke truncate on table "public"."web_manual_images" from "anon";

revoke update on table "public"."web_manual_images" from "anon";

revoke references on table "public"."web_manual_images" from "authenticated";

revoke trigger on table "public"."web_manual_images" from "authenticated";

revoke truncate on table "public"."web_manual_images" from "authenticated";

revoke references on table "public"."web_manual_images" from "service_role";

revoke trigger on table "public"."web_manual_images" from "service_role";

revoke truncate on table "public"."web_manual_images" from "service_role";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.acquire_cron_lock(p_job_name text, p_lock_duration_minutes integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_now timestamp with time zone := now();
BEGIN
    -- Try to insert a new lock, or update an existing one IF it has expired.
    -- The WHERE clause ensures we don't overwrite an active lock.
    INSERT INTO public.cron_locks (job_name, locked_until)
    VALUES (p_job_name, v_now + (p_lock_duration_minutes || ' minutes')::interval)
    ON CONFLICT (job_name) DO UPDATE
    SET locked_until = v_now + (p_lock_duration_minutes || ' minutes')::interval
    WHERE cron_locks.locked_until < v_now;

    -- Return true if we successfully inserted or updated the row (ie, got the lock)
    IF FOUND THEN
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_manual_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count INT;
  v_max INT;
BEGIN
  SELECT count(*) INTO v_count FROM public.manuals WHERE company_id = NEW.company_id;
  
  SELECT l.max_manuals INTO v_max 
  FROM public.company_licenses cl 
  JOIN public.licenses l ON cl.license_id = l.id 
  WHERE cl.company_id = NEW.company_id;
  
  IF v_max IS NOT NULL AND v_count >= v_max THEN
    RAISE EXCEPTION 'License limit reached: Cannot exceed % manuals', v_max;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_public_manual_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count INT;
  v_max INT;
BEGIN
  IF NEW.is_public = true AND (TG_OP = 'INSERT' OR OLD.is_public = false) THEN
    SELECT count(*) INTO v_count FROM public.manuals WHERE company_id = NEW.company_id AND is_public = true AND id != NEW.id;
    
    SELECT l.max_public_manuals INTO v_max 
    FROM public.company_licenses cl 
    JOIN public.licenses l ON cl.license_id = l.id 
    WHERE cl.company_id = NEW.company_id;
    
    IF v_max IS NOT NULL AND (v_count + 1) > v_max THEN
      RAISE EXCEPTION 'License limit reached: Cannot exceed % public manuals', v_max;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_user_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count INT;
  v_max INT;
BEGIN
  -- We count all non-rejected members (active, invited)
  SELECT count(*) INTO v_count FROM public.company_users WHERE company_id = NEW.company_id AND status IN ('active', 'invited');
  
  SELECT l.max_users INTO v_max 
  FROM public.company_licenses cl 
  JOIN public.licenses l ON cl.license_id = l.id 
  WHERE cl.company_id = NEW.company_id;
  
  IF v_max IS NOT NULL AND v_count >= v_max THEN
    RAISE EXCEPTION 'License limit reached: Cannot exceed % users', v_max;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_user(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_requesting_user_id UUID := auth.uid();
  v_company_id UUID;
  v_target_cu_id UUID;
  v_target_role TEXT;
  v_requesting_role TEXT;
BEGIN
  -- 1. Get the company and role of the target user
  SELECT id, company_id, role INTO v_target_cu_id, v_company_id, v_target_role
  FROM public.company_users
  WHERE user_id = target_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found in any company.';
  END IF;

  -- 2. Verify requesting user has permission to manage users in that company
  IF NOT public.has_company_permission(v_company_id, 'page.users') THEN
    RAISE EXCEPTION 'Unauthorized: Requires page.users permission.';
  END IF;

  -- 3. Get the role of the requesting user
  SELECT role INTO v_requesting_role
  FROM public.company_users
  WHERE user_id = v_requesting_user_id
    AND company_id = v_company_id;

  -- 4. Role enforcement: members cannot delete admins
  IF v_target_role = 'admin' AND v_requesting_role != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can remove other admins.';
  END IF;

  -- 5. Delete the user entirely from the auth system
  -- Since company_users ON DELETE CASCADE (or similar), this cleans up everything
  DELETE FROM auth.users WHERE id = target_user_id;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_company_membership()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  uid uuid;
  existing_company_id uuid;
  user_company_name text;
  user_email text;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT company_id INTO existing_company_id
    FROM public.company_users WHERE user_id = uid LIMIT 1;
  IF existing_company_id IS NOT NULL THEN RETURN existing_company_id; END IF;

  SELECT
    COALESCE(NULLIF(TRIM(substring(raw_user_meta_data ->> 'company_name', 1, 200)), ''), 'My Company'),
    email
  INTO user_company_name, user_email
  FROM auth.users WHERE id = uid;

  INSERT INTO public.profiles (id, email) VALUES (uid, user_email) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.companies (id, name, slug, portal_enabled)
    VALUES (uid, user_company_name, public.generate_company_slug(user_company_name), false)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.company_users (company_id, user_id, status, role, created_by)
    VALUES (uid, uid, 'active', 'admin', uid)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT company_id INTO existing_company_id
    FROM public.company_users WHERE user_id = uid LIMIT 1;

  IF existing_company_id IS NOT NULL THEN
    INSERT INTO public.company_user_permissions (company_user_id, permission_key)
      SELECT cu.id, p.key
        FROM public.company_users cu CROSS JOIN public.permissions p
        WHERE cu.user_id = uid
      ON CONFLICT DO NOTHING;
  END IF;

  RETURN existing_company_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_company_slug(company_name text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 0;
BEGIN
  base_slug := lower(regexp_replace(regexp_replace(trim(company_name), '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  base_slug := substring(base_slug, 1, 50);
  base_slug := trim(both '-' from base_slug);
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'company-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;
  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.companies WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  RETURN final_slug;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_current_period_token_usage(p_company_id uuid, p_reset_day integer DEFAULT 1)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  period_start TIMESTAMPTZ;
BEGIN
  -- Clamp reset_day to valid range 1-28 to avoid month-boundary issues
  p_reset_day := GREATEST(1, LEAST(28, p_reset_day));

  -- Determine the start of the current billing period
  IF EXTRACT(DAY FROM now()) >= p_reset_day THEN
    -- Reset day has already passed this month
    period_start := date_trunc('month', now()) + ((p_reset_day - 1) || ' days')::INTERVAL;
  ELSE
    -- Reset day hasn't occurred yet — look back to last month
    period_start := date_trunc('month', now() - INTERVAL '1 month') + ((p_reset_day - 1) || ' days')::INTERVAL;
  END IF;

  RETURN (
    SELECT COALESCE(SUM(total_tokens), 0)
    FROM ai_token_usage_logs
    WHERE company_id = p_company_id
      AND created_at >= period_start
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_monthly_token_usage(company_id_param uuid)
 RETURNS TABLE(month date, feature character varying, total_prompt_tokens bigint, total_completion_tokens bigint, total_tokens bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT 
        DATE_TRUNC('month', created_at)::DATE as month,
        feature,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(completion_tokens) as total_completion_tokens,
        SUM(public.ai_token_usage_logs.total_tokens) as total_tokens
    FROM public.ai_token_usage_logs
    WHERE company_id = company_id_param
    GROUP BY DATE_TRUNC('month', created_at)::DATE, feature
    ORDER BY month DESC, feature;
$function$
;

CREATE OR REPLACE FUNCTION public.get_unclassified_sessions(p_limit integer DEFAULT 50)
 RETURNS SETOF public.ai_chat_sessions
 LANGUAGE sql
 STABLE
AS $function$
  SELECT *
  FROM ai_chat_sessions
  WHERE
    label IS NULL
    AND classification_attempts < 3
    AND updated_at < now() - INTERVAL '2 hours'
  ORDER BY updated_at ASC
  LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID;
  v_invite_token TEXT;
  v_invite_record RECORD;
BEGIN
  -- Extract invite token from metadata (if present)
  v_invite_token := NEW.raw_user_meta_data->>'invite_token';

  -- Insert a thin profile row
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  IF v_invite_token IS NOT NULL THEN
    -- ── Invite flow ──────────────────────────────────────────
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
  END IF;
  
  -- If not invited, we do NOT auto-create a company anymore.
  -- The user will simply exist with a profile and zero companies,
  -- until a superadmin provisions their company manually via the API
  -- and inserts a company_users row using the admin credentials.

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user_message_reopen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Only trigger for NEW 'user' messages
    IF NEW.role = 'user' THEN
        UPDATE public.ai_chat_sessions
        SET
            label = NULL,
            conclusion = NULL,
            theme_id = NULL,
            classification_attempts = 0,
            updated_at = NOW() -- Also reset the idle timer
        WHERE id = NEW.session_id;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_theme_session_count(p_theme_id uuid, p_milestones integer[])
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  new_count INT;
BEGIN
  UPDATE ai_chat_themes
  SET
    session_count = session_count + 1,
    needs_retitle = CASE
      WHEN (session_count + 1) = ANY(p_milestones) THEN true
      ELSE needs_retitle
    END
  WHERE id = p_theme_id
  RETURNING session_count INTO new_count;

  RETURN new_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_superadmin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    superadmin_status boolean;
BEGIN
    SELECT is_superadmin INTO superadmin_status
    FROM public.profiles
    WHERE id = user_id;
    
    RETURN COALESCE(superadmin_status, false);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_chat_themes(p_company_id uuid, p_label text, p_embedding public.vector, p_threshold double precision DEFAULT 0.85)
 RETURNS TABLE(id uuid, title text, session_count integer, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    t.id,
    t.title,
    t.session_count,
    1 - (t.embedding <=> p_embedding) AS similarity
  FROM ai_chat_themes t
  WHERE
    t.company_id = p_company_id
    AND t.label   = p_label
    AND t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> p_embedding) >= p_threshold
  ORDER BY t.embedding <=> p_embedding
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.release_cron_lock(p_job_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE public.cron_locks
    SET locked_until = now() - interval '1 second'
    WHERE job_name = p_job_name;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_company_id_from_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id 
    FROM public.company_users 
    WHERE user_id = auth.uid() 
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_ai_chat_themes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_session_classification(p_session_id uuid, p_label text, p_conclusion text, p_theme_id uuid, p_error_message text)
 RETURNS void
 LANGUAGE sql
AS $function$
  UPDATE ai_chat_sessions
  SET
    label                    = COALESCE(p_label, label),
    conclusion               = COALESCE(p_conclusion, conclusion),
    theme_id                 = COALESCE(p_theme_id, theme_id),
    error_message            = COALESCE(p_error_message, error_message),
    classification_attempts  = classification_attempts + 1
  WHERE id = p_session_id;
$function$
;

CREATE OR REPLACE FUNCTION public.update_session_updated_at_on_message()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE ai_chat_sessions
    SET updated_at = now()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_role(target_company_user_id uuid, new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_requesting_user_id UUID := auth.uid();
  v_company_id UUID;
  v_target_role TEXT;
  v_requesting_role TEXT;
  v_admin_count INT;
BEGIN
  -- Validate input
  IF new_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'Invalid role specified.';
  END IF;

  -- 1. Get details of the target company user
  SELECT company_id, role INTO v_company_id, v_target_role
  FROM public.company_users
  WHERE id = target_company_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found.';
  END IF;

  -- 2. Get the role of the requesting user
  SELECT role INTO v_requesting_role
  FROM public.company_users
  WHERE user_id = v_requesting_user_id
    AND company_id = v_company_id;

  -- 3. Security check: Only admins can change roles
  IF v_requesting_role != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can change roles.';
  END IF;

  -- 4. Self-lockout protection: if demoting an admin to member
  IF v_target_role = 'admin' AND new_role = 'member' THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM public.company_users
    WHERE company_id = v_company_id AND role = 'admin' AND status = 'active';

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last remaining admin of the company.';
    END IF;
  END IF;

  -- 5. Perform the update
  UPDATE public.company_users
  SET role = new_role
  WHERE id = target_company_user_id;

END;
$function$
;


