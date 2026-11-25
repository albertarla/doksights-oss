


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;




ALTER SCHEMA "public" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE OR REPLACE FUNCTION "public"."acquire_cron_lock"("p_job_name" "text", "p_lock_duration_minutes" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."acquire_cron_lock"("p_job_name" "text", "p_lock_duration_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_manual_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."check_manual_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_public_manual_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."check_public_manual_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_user_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."check_user_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user"("target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."delete_user"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_company_membership"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."ensure_company_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_company_slug"("company_name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."generate_company_slug"("company_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_period_token_usage"("p_company_id" "uuid", "p_reset_day" integer DEFAULT 1) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_start_date timestamp with time zone;
    v_total bigint;
BEGIN
    -- Determine the start date of the current billing cycle based on the reset day.
    -- If the current day of the month is >= reset_day, the cycle started this month.
    -- Otherwise, it started last month.
    IF extract(day from current_date) >= p_reset_day THEN
        v_start_date := (date_trunc('month', current_date) + (p_reset_day - 1) * interval '1 day') AT TIME ZONE 'UTC';
    ELSE
        v_start_date := (date_trunc('month', current_date - interval '1 month') + (p_reset_day - 1) * interval '1 day') AT TIME ZONE 'UTC';
    END IF;

    -- Sum up all recorded tokens (prompt, completion, embedding) since the start of the billing period
    SELECT COALESCE(SUM(
        COALESCE(prompt_tokens, 0) + 
        COALESCE(completion_tokens, 0) + 
        COALESCE(embedding_tokens, 0)
    ), 0)
    INTO v_total
    FROM public.ai_token_usage_logs
    WHERE company_id = p_company_id
      AND created_at >= v_start_date;

    RETURN v_total;
END;
$$;


ALTER FUNCTION "public"."get_current_period_token_usage"("p_company_id" "uuid", "p_reset_day" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_current_period_token_usage"("p_company_id" "uuid", "p_reset_day" integer) IS 'Calculates the cumulative AI token usage for a specific company strictly within their current tracking period window.';



CREATE OR REPLACE FUNCTION "public"."get_invite_context"("invite_token" "text") RETURNS TABLE("invite_id" "uuid", "company_id" "uuid", "company_name" "text", "email" "text", "permissions" "text"[], "accepted_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY SELECT ci.id, c.id, c.name, ci.email, COALESCE(array_agg(cip.permission_key ORDER BY cip.permission_key), '{}'::text[]), ci.accepted_at FROM public.company_invites ci JOIN public.companies c ON c.id = ci.company_id LEFT JOIN public.company_invite_permissions cip ON cip.invite_id = ci.id WHERE ci.token = invite_token GROUP BY ci.id, c.id, c.name, ci.email, ci.accepted_at;
END;
$$;


ALTER FUNCTION "public"."get_invite_context"("invite_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_token_usage"("company_id_param" "uuid") RETURNS TABLE("month" "date", "feature" character varying, "total_prompt_tokens" bigint, "total_completion_tokens" bigint, "total_tokens" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_monthly_token_usage"("company_id_param" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_chat_sessions" (
    "id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "manual_id" "uuid",
    "chat_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "label" "text",
    "conclusion" "text",
    "classification_attempts" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "theme_id" "uuid",
    CONSTRAINT "ai_chat_sessions_chat_type_check" CHECK (("chat_type" = ANY (ARRAY['standard'::"text", 'discovery'::"text"])))
);


ALTER TABLE "public"."ai_chat_sessions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unclassified_sessions"("p_limit" integer DEFAULT 50) RETURNS SETOF "public"."ai_chat_sessions"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT *
  FROM ai_chat_sessions
  WHERE
    label IS NULL
    AND classification_attempts < 3
    AND updated_at < now() - INTERVAL '2 hours'
  ORDER BY updated_at ASC
  LIMIT p_limit;
$$;


ALTER FUNCTION "public"."get_unclassified_sessions"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_message_reopen"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_user_message_reopen"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_company_permission"("company_id" "uuid", "permission_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
  SELECT EXISTS (SELECT 1 FROM public.company_users cu JOIN public.company_user_permissions cup ON cup.company_user_id = cu.id WHERE cu.company_id = $1 AND cu.user_id = auth.uid() AND cu.status = 'active' AND cup.permission_key = $2);
$_$;


ALTER FUNCTION "public"."has_company_permission"("company_id" "uuid", "permission_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_theme_session_count"("p_theme_id" "uuid", "p_milestones" integer[]) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."increment_theme_session_count"("p_theme_id" "uuid", "p_milestones" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_company_member"("company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
  SELECT EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = $1 AND cu.user_id = auth.uid() AND cu.status = 'active');
$_$;


ALTER FUNCTION "public"."is_company_member"("company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    superadmin_status boolean;
BEGIN
    SELECT is_superadmin INTO superadmin_status
    FROM public.profiles
    WHERE id = user_id;
    
    RETURN COALESCE(superadmin_status, false);
END;
$$;


ALTER FUNCTION "public"."is_superadmin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_chat_themes"("p_company_id" "uuid", "p_label" "text", "p_embedding" "public"."vector", "p_threshold" double precision DEFAULT 0.85) RETURNS TABLE("id" "uuid", "title" "text", "session_count" integer, "similarity" double precision)
    LANGUAGE "sql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."match_chat_themes"("p_company_id" "uuid", "p_label" "text", "p_embedding" "public"."vector", "p_threshold" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_manual_chunks"("manual_ids" "uuid"[], "query_embedding" "public"."vector", "match_count" integer DEFAULT 5) RETURNS TABLE("id" "uuid", "manual_id" "uuid", "content" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT mc.id, mc.manual_id, mc.content, mc.metadata, 1 - (mc.embedding <=> query_embedding) AS similarity FROM public.manual_chunks mc WHERE mc.manual_id = ANY(manual_ids) ORDER BY mc.embedding <=> query_embedding LIMIT match_count;
$$;


ALTER FUNCTION "public"."match_manual_chunks"("manual_ids" "uuid"[], "query_embedding" "public"."vector", "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_manual_summaries_by_company"("company_id_param" "uuid", "query_embedding" "public"."vector", "match_count" integer DEFAULT 5) RETURNS TABLE("id" "uuid", "title" "text", "description" "text", "summary" "text", "similarity" double precision, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT m.id, m.title, m.description, m.summary, 1 - (m.summary_embedding <=> query_embedding) AS similarity, m.created_at FROM manuals m WHERE m.company_id = company_id_param AND m.summary_embedding IS NOT NULL ORDER BY m.summary_embedding <=> query_embedding LIMIT match_count;
$$;


ALTER FUNCTION "public"."match_manual_summaries_by_company"("company_id_param" "uuid", "query_embedding" "public"."vector", "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_public_manual_summaries_by_company"("company_id_param" "uuid", "query_embedding" "public"."vector", "match_count" integer DEFAULT 5) RETURNS TABLE("id" "uuid", "title" "text", "description" "text", "summary" "text", "similarity" double precision, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT m.id, m.title, m.description, m.summary, 1 - (m.summary_embedding <=> query_embedding) AS similarity, m.created_at FROM manuals m WHERE m.company_id = company_id_param AND m.is_public = true AND m.summary_embedding IS NOT NULL ORDER BY m.summary_embedding <=> query_embedding LIMIT match_count;
$$;


ALTER FUNCTION "public"."match_public_manual_summaries_by_company"("company_id_param" "uuid", "query_embedding" "public"."vector", "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_cron_lock"("p_job_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.cron_locks
    SET locked_until = now() - interval '1 second'
    WHERE job_name = p_job_name;
END;
$$;


ALTER FUNCTION "public"."release_cron_lock"("p_job_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_company_id_from_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id 
    FROM public.company_users 
    WHERE user_id = auth.uid() 
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_company_id_from_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ai_chat_themes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ai_chat_themes_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_session_classification"("p_session_id" "uuid", "p_label" "text", "p_conclusion" "text", "p_theme_id" "uuid", "p_error_message" "text") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  UPDATE ai_chat_sessions
  SET
    label                    = COALESCE(p_label, label),
    conclusion               = COALESCE(p_conclusion, conclusion),
    theme_id                 = COALESCE(p_theme_id, theme_id),
    error_message            = COALESCE(p_error_message, error_message),
    classification_attempts  = classification_attempts + 1
  WHERE id = p_session_id;
$$;


ALTER FUNCTION "public"."update_session_classification"("p_session_id" "uuid", "p_label" "text", "p_conclusion" "text", "p_theme_id" "uuid", "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_session_updated_at_on_message"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE ai_chat_sessions
    SET updated_at = now()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_session_updated_at_on_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_role"("target_company_user_id" "uuid", "new_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."update_user_role"("target_company_user_id" "uuid", "new_role" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "ai_chat_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."ai_chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_chat_themes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "title" "text" NOT NULL,
    "embedding" "public"."vector"(1536),
    "session_count" integer DEFAULT 0 NOT NULL,
    "needs_retitle" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_chat_themes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_token_usage_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "feature" character varying NOT NULL,
    "model" character varying NOT NULL,
    "related_id" "uuid",
    "prompt_tokens" integer DEFAULT 0 NOT NULL,
    "completion_tokens" integer DEFAULT 0 NOT NULL,
    "total_tokens" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."ai_token_usage_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_token_usage_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "portal_enabled" boolean DEFAULT false NOT NULL,
    "portal_description" "text",
    "logo_url" "text",
    "portal_primary_color" "text",
    "portal_background_color" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_invite_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invite_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_invite_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "token" "text" NOT NULL,
    "accepted_at" timestamp with time zone,
    "accepted_by" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_licenses" (
    "company_id" "uuid" NOT NULL,
    "license_id" "uuid" NOT NULL,
    "subscription_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."company_licenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_user_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_user_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_user_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    CONSTRAINT "company_users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"]))),
    CONSTRAINT "company_users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'invited'::"text"])))
);


ALTER TABLE "public"."company_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cron_locks" (
    "job_name" "text" NOT NULL,
    "locked_until" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."cron_locks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."licenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "max_manuals" integer DEFAULT 1 NOT NULL,
    "max_public_manuals" integer DEFAULT 0 NOT NULL,
    "max_users" integer DEFAULT 1 NOT NULL,
    "features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "max_ai_tokens" integer
);


ALTER TABLE "public"."licenses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."licenses"."max_ai_tokens" IS 'Maximum number of AI tokens allowed per billing cycle. NULL means unlimited.';



CREATE TABLE IF NOT EXISTS "public"."manual_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "manual_id" "uuid" NOT NULL,
    "chunk_index" integer NOT NULL,
    "content" "text" NOT NULL,
    "embedding" "public"."vector"(1536) NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."manual_chunks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manual_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "manual_id" "uuid" NOT NULL,
    "company_id" "uuid",
    "link_id" "uuid",
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reading_duration_seconds" integer DEFAULT 0,
    "pages_viewed" integer DEFAULT 1,
    "total_pages" integer DEFAULT 1,
    "referrer" "text",
    "user_agent" "text",
    "country" "text",
    "source" "text" DEFAULT 'link'::"text",
    "hashed_identifier" "text"
);


ALTER TABLE "public"."manual_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manuals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "folder_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "page_count" integer,
    "is_public" boolean DEFAULT false NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "extracted_text" "text",
    "extraction_status" "text" DEFAULT 'pending'::"text",
    "rag_status" "text" DEFAULT 'pending'::"text",
    "rag_error" "text",
    "summary" "text",
    "summary_embedding" "public"."vector"(1536),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "manuals_extraction_status_check" CHECK (("extraction_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "manuals_rag_status_check" CHECK (("rag_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."manuals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "key" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_superadmin" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_chat_messages"
    ADD CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_chat_sessions"
    ADD CONSTRAINT "ai_chat_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_chat_themes"
    ADD CONSTRAINT "ai_chat_themes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_token_usage_logs"
    ADD CONSTRAINT "ai_token_usage_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."company_invite_permissions"
    ADD CONSTRAINT "company_invite_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_invites"
    ADD CONSTRAINT "company_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_invites"
    ADD CONSTRAINT "company_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."company_licenses"
    ADD CONSTRAINT "company_licenses_pkey" PRIMARY KEY ("company_id");



ALTER TABLE ONLY "public"."company_user_permissions"
    ADD CONSTRAINT "company_user_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_users"
    ADD CONSTRAINT "company_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cron_locks"
    ADD CONSTRAINT "cron_locks_pkey" PRIMARY KEY ("job_name");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."licenses"
    ADD CONSTRAINT "licenses_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."licenses"
    ADD CONSTRAINT "licenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manual_chunks"
    ADD CONSTRAINT "manual_chunks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manual_views"
    ADD CONSTRAINT "manual_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manuals"
    ADD CONSTRAINT "manuals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_ai_chat_messages_session_id" ON "public"."ai_chat_messages" USING "btree" ("session_id");



CREATE INDEX "idx_ai_chat_sessions_company_id" ON "public"."ai_chat_sessions" USING "btree" ("company_id");



CREATE INDEX "idx_ai_chat_sessions_manual_id" ON "public"."ai_chat_sessions" USING "btree" ("manual_id");



CREATE INDEX "idx_ai_chat_themes_company_label" ON "public"."ai_chat_themes" USING "btree" ("company_id", "label");



CREATE INDEX "idx_ai_chat_themes_embedding_hnsw" ON "public"."ai_chat_themes" USING "hnsw" ("embedding" "public"."vector_cosine_ops") WITH ("m"='16', "ef_construction"='64');



CREATE INDEX "idx_ai_token_usage_logs_company_time" ON "public"."ai_token_usage_logs" USING "btree" ("company_id", "created_at");



CREATE INDEX "idx_company_invite_permissions_invite_id" ON "public"."company_invite_permissions" USING "btree" ("invite_id");



CREATE UNIQUE INDEX "idx_company_invite_permissions_unique" ON "public"."company_invite_permissions" USING "btree" ("invite_id", "permission_key");



CREATE INDEX "idx_company_invites_company_id" ON "public"."company_invites" USING "btree" ("company_id");



CREATE INDEX "idx_company_user_permissions_company_user_id" ON "public"."company_user_permissions" USING "btree" ("company_user_id");



CREATE UNIQUE INDEX "idx_company_user_permissions_unique" ON "public"."company_user_permissions" USING "btree" ("company_user_id", "permission_key");



CREATE INDEX "idx_company_users_company_id" ON "public"."company_users" USING "btree" ("company_id");



CREATE UNIQUE INDEX "idx_company_users_company_user_unique" ON "public"."company_users" USING "btree" ("company_id", "user_id");



CREATE UNIQUE INDEX "idx_company_users_user_unique" ON "public"."company_users" USING "btree" ("user_id");



CREATE INDEX "idx_folders_company_id" ON "public"."folders" USING "btree" ("company_id");



CREATE INDEX "idx_manual_chunks_embedding_hnsw" ON "public"."manual_chunks" USING "hnsw" ("embedding" "public"."vector_cosine_ops") WITH ("m"='16', "ef_construction"='64');



CREATE INDEX "idx_manual_chunks_manual_id" ON "public"."manual_chunks" USING "btree" ("manual_id");



CREATE INDEX "idx_manual_views_company_id" ON "public"."manual_views" USING "btree" ("company_id");



CREATE INDEX "idx_manual_views_manual_id" ON "public"."manual_views" USING "btree" ("manual_id");



CREATE INDEX "idx_manual_views_viewed_at" ON "public"."manual_views" USING "btree" ("viewed_at");



CREATE INDEX "idx_manuals_company_id" ON "public"."manuals" USING "btree" ("company_id");



CREATE INDEX "idx_manuals_folder" ON "public"."manuals" USING "btree" ("folder_id") WHERE ("folder_id" IS NOT NULL);



CREATE INDEX "idx_manuals_summary_embedding_hnsw" ON "public"."manuals" USING "hnsw" ("summary_embedding" "public"."vector_cosine_ops") WITH ("m"='16', "ef_construction"='64');



CREATE OR REPLACE TRIGGER "enforce_user_limit" BEFORE INSERT ON "public"."company_users" FOR EACH ROW EXECUTE FUNCTION "public"."check_user_limit"();



CREATE OR REPLACE TRIGGER "set_folders_company_id" BEFORE INSERT ON "public"."folders" FOR EACH ROW EXECUTE FUNCTION "public"."set_company_id_from_user"();



CREATE OR REPLACE TRIGGER "set_manual_views_company_id" BEFORE INSERT ON "public"."manual_views" FOR EACH ROW EXECUTE FUNCTION "public"."set_company_id_from_user"();



CREATE OR REPLACE TRIGGER "set_manuals_company_id" BEFORE INSERT ON "public"."manuals" FOR EACH ROW EXECUTE FUNCTION "public"."set_company_id_from_user"();



CREATE OR REPLACE TRIGGER "tr_reopen_session_on_message" AFTER INSERT ON "public"."ai_chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user_message_reopen"();



CREATE OR REPLACE TRIGGER "trg_ai_chat_themes_updated_at" BEFORE UPDATE ON "public"."ai_chat_themes" FOR EACH ROW EXECUTE FUNCTION "public"."update_ai_chat_themes_updated_at"();



CREATE OR REPLACE TRIGGER "trg_session_updated_at_on_message" AFTER INSERT ON "public"."ai_chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_session_updated_at_on_message"();



CREATE OR REPLACE TRIGGER "update_companies_updated_at" BEFORE UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_company_users_updated_at" BEFORE UPDATE ON "public"."company_users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_folders_updated_at" BEFORE UPDATE ON "public"."folders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_manuals_updated_at" BEFORE UPDATE ON "public"."manuals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "z_enforce_manual_limit" BEFORE INSERT ON "public"."manuals" FOR EACH ROW EXECUTE FUNCTION "public"."check_manual_limit"();



CREATE OR REPLACE TRIGGER "z_enforce_public_manual_limit" BEFORE INSERT OR UPDATE ON "public"."manuals" FOR EACH ROW EXECUTE FUNCTION "public"."check_public_manual_limit"();



ALTER TABLE ONLY "public"."ai_chat_messages"
    ADD CONSTRAINT "ai_chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ai_chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_chat_sessions"
    ADD CONSTRAINT "ai_chat_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_chat_sessions"
    ADD CONSTRAINT "ai_chat_sessions_manual_id_fkey" FOREIGN KEY ("manual_id") REFERENCES "public"."manuals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_chat_sessions"
    ADD CONSTRAINT "ai_chat_sessions_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "public"."ai_chat_themes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_chat_themes"
    ADD CONSTRAINT "ai_chat_themes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_token_usage_logs"
    ADD CONSTRAINT "ai_token_usage_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_invite_permissions"
    ADD CONSTRAINT "company_invite_permissions_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "public"."company_invites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_invite_permissions"
    ADD CONSTRAINT "company_invite_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_invites"
    ADD CONSTRAINT "company_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_invites"
    ADD CONSTRAINT "company_invites_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_invites"
    ADD CONSTRAINT "company_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_licenses"
    ADD CONSTRAINT "company_licenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_licenses"
    ADD CONSTRAINT "company_licenses_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."company_user_permissions"
    ADD CONSTRAINT "company_user_permissions_company_user_id_fkey" FOREIGN KEY ("company_user_id") REFERENCES "public"."company_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_user_permissions"
    ADD CONSTRAINT "company_user_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_users"
    ADD CONSTRAINT "company_users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_users"
    ADD CONSTRAINT "company_users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_users"
    ADD CONSTRAINT "company_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."manual_chunks"
    ADD CONSTRAINT "manual_chunks_manual_id_fkey" FOREIGN KEY ("manual_id") REFERENCES "public"."manuals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manual_views"
    ADD CONSTRAINT "manual_views_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."manual_views"
    ADD CONSTRAINT "manual_views_manual_id_fkey" FOREIGN KEY ("manual_id") REFERENCES "public"."manuals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manuals"
    ADD CONSTRAINT "manuals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."manuals"
    ADD CONSTRAINT "manuals_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can read permissions" ON "public"."permissions" FOR SELECT USING (true);



CREATE POLICY "Company members can view folders" ON "public"."folders" FOR SELECT USING ((("company_id" IS NOT NULL) AND "public"."is_company_member"("company_id")));



CREATE POLICY "Company members can view manuals" ON "public"."manuals" FOR SELECT USING ((("company_id" IS NOT NULL) AND "public"."is_company_member"("company_id")));



CREATE POLICY "Company members can view their company license" ON "public"."company_licenses" FOR SELECT USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Company members can view their license" ON "public"."licenses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."company_licenses" "cl"
     JOIN "public"."company_users" "cu" ON (("cu"."company_id" = "cl"."company_id")))
  WHERE (("cl"."license_id" = "licenses"."id") AND ("cu"."user_id" = "auth"."uid"())))));



CREATE POLICY "Company members with analytics permission can view analytics" ON "public"."manual_views" FOR SELECT USING ((("company_id" IS NOT NULL) AND "public"."has_company_permission"("company_id", 'page.analytics'::"text")));



CREATE POLICY "Company members with analytics permission can view chat message" ON "public"."ai_chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ai_chat_sessions" "s"
  WHERE (("s"."id" = "ai_chat_messages"."session_id") AND ("s"."company_id" IS NOT NULL) AND "public"."has_company_permission"("s"."company_id", 'page.analytics'::"text")))));



CREATE POLICY "Company members with analytics permission can view chat session" ON "public"."ai_chat_sessions" FOR SELECT USING ((("company_id" IS NOT NULL) AND "public"."has_company_permission"("company_id", 'page.analytics'::"text")));



CREATE POLICY "Edge function can insert views" ON "public"."manual_views" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."manuals" "m"
     JOIN "public"."companies" "c" ON (("c"."id" = "m"."company_id")))
  WHERE (("m"."id" = "manual_views"."manual_id") AND ("m"."is_public" = true) AND ("c"."portal_enabled" = true)))));



CREATE POLICY "Enable all for service role on cron_locks" ON "public"."cron_locks" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Members can view their company" ON "public"."companies" FOR SELECT USING ("public"."is_company_member"("id"));



CREATE POLICY "Public can view folders for enabled portals" ON "public"."folders" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."companies" "c"
  WHERE (("c"."id" = "folders"."company_id") AND ("c"."portal_enabled" = true)))));



CREATE POLICY "Public can view portal-enabled companies" ON "public"."companies" FOR SELECT USING (("portal_enabled" = true));



CREATE POLICY "Public can view public manuals for enabled portals" ON "public"."manuals" FOR SELECT USING ((("is_public" = true) AND (EXISTS ( SELECT 1
   FROM "public"."companies" "c"
  WHERE (("c"."id" = "manuals"."company_id") AND ("c"."portal_enabled" = true))))));



CREATE POLICY "Service role can insert messages" ON "public"."ai_chat_messages" FOR INSERT WITH CHECK (true);



CREATE POLICY "Service role can insert sessions" ON "public"."ai_chat_sessions" FOR INSERT WITH CHECK (true);



CREATE POLICY "Superadmins can delete any folder" ON "public"."folders" FOR DELETE USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can delete any manual" ON "public"."manuals" FOR DELETE USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can manage company licenses" ON "public"."company_licenses" USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can manage licenses" ON "public"."licenses" USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can update all company_users" ON "public"."company_users" FOR UPDATE USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can update any company" ON "public"."companies" FOR UPDATE USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can update any folder" ON "public"."folders" FOR UPDATE USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can update any manual" ON "public"."manuals" FOR UPDATE USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can update any profile" ON "public"."profiles" FOR UPDATE USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can view all companies" ON "public"."companies" FOR SELECT USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can view all company_users" ON "public"."company_users" FOR SELECT USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can view all folders" ON "public"."folders" FOR SELECT USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can view all manual_views" ON "public"."manual_views" FOR SELECT USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can view all manuals" ON "public"."manuals" FOR SELECT USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Superadmins can view all profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_superadmin"("auth"."uid"()));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can read token logs for their company with analytics perm" ON "public"."ai_token_usage_logs" FOR SELECT TO "authenticated" USING (("public"."has_company_permission"("company_id", 'page.analytics'::"text") OR "public"."is_superadmin"("auth"."uid"())));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their membership" ON "public"."company_users" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their permissions" ON "public"."company_user_permissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."company_users" "cu"
  WHERE (("cu"."id" = "company_user_permissions"."company_user_id") AND ("cu"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users with manuals permission can delete folders" ON "public"."folders" FOR DELETE USING ((("company_id" IS NOT NULL) AND "public"."has_company_permission"("company_id", 'page.manuals'::"text")));



CREATE POLICY "Users with manuals permission can delete manuals" ON "public"."manuals" FOR DELETE USING ((("company_id" IS NOT NULL) AND "public"."has_company_permission"("company_id", 'page.manuals'::"text")));



CREATE POLICY "Users with manuals permission can insert folders" ON "public"."folders" FOR INSERT WITH CHECK ((("company_id" IS NOT NULL) AND "public"."has_company_permission"("company_id", 'page.manuals'::"text")));



CREATE POLICY "Users with manuals permission can insert manuals" ON "public"."manuals" FOR INSERT WITH CHECK ((("company_id" IS NOT NULL) AND "public"."has_company_permission"("company_id", 'page.manuals'::"text")));



CREATE POLICY "Users with manuals permission can update folders" ON "public"."folders" FOR UPDATE USING ((("company_id" IS NOT NULL) AND "public"."has_company_permission"("company_id", 'page.manuals'::"text"))) WITH CHECK ((("company_id" IS NOT NULL) AND "public"."has_company_permission"("company_id", 'page.manuals'::"text")));



CREATE POLICY "Users with manuals permission can update manuals" ON "public"."manuals" FOR UPDATE USING ((("company_id" IS NOT NULL) AND "public"."has_company_permission"("company_id", 'page.manuals'::"text"))) WITH CHECK ((("company_id" IS NOT NULL) AND "public"."has_company_permission"("company_id", 'page.manuals'::"text")));



CREATE POLICY "Users with portal permission can update company settings" ON "public"."companies" FOR UPDATE USING ("public"."has_company_permission"("id", 'page.portal'::"text")) WITH CHECK ("public"."has_company_permission"("id", 'page.portal'::"text"));



CREATE POLICY "Users with user-management permission can manage invite permiss" ON "public"."company_invite_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."company_invites" "ci"
  WHERE (("ci"."id" = "company_invite_permissions"."invite_id") AND "public"."has_company_permission"("ci"."company_id", 'page.users'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."company_invites" "ci"
  WHERE (("ci"."id" = "company_invite_permissions"."invite_id") AND "public"."has_company_permission"("ci"."company_id", 'page.users'::"text")))));



CREATE POLICY "Users with user-management permission can manage invites" ON "public"."company_invites" USING ("public"."has_company_permission"("company_id", 'page.users'::"text")) WITH CHECK ("public"."has_company_permission"("company_id", 'page.users'::"text"));



CREATE POLICY "Users with user-management permission can manage members" ON "public"."company_users" USING ("public"."has_company_permission"("company_id", 'page.users'::"text")) WITH CHECK ("public"."has_company_permission"("company_id", 'page.users'::"text"));



CREATE POLICY "Users with user-management permission can manage permissions" ON "public"."company_user_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."company_users" "cu"
  WHERE (("cu"."id" = "company_user_permissions"."company_user_id") AND "public"."has_company_permission"("cu"."company_id", 'page.users'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."company_users" "cu"
  WHERE (("cu"."id" = "company_user_permissions"."company_user_id") AND "public"."has_company_permission"("cu"."company_id", 'page.users'::"text")))));



CREATE POLICY "Users with user-management permission can view profiles in thei" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."company_users" "cu"
     JOIN "public"."company_users" "target" ON (("target"."company_id" = "cu"."company_id")))
  WHERE (("cu"."user_id" = "auth"."uid"()) AND ("target"."user_id" = "profiles"."id") AND "public"."has_company_permission"("cu"."company_id", 'page.users'::"text")))));



ALTER TABLE "public"."ai_chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_chat_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_chat_themes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_chat_themes_no_client_delete" ON "public"."ai_chat_themes" FOR DELETE USING (false);



CREATE POLICY "ai_chat_themes_no_client_update" ON "public"."ai_chat_themes" FOR UPDATE USING (false);



CREATE POLICY "ai_chat_themes_no_client_write" ON "public"."ai_chat_themes" FOR INSERT WITH CHECK (false);



CREATE POLICY "ai_chat_themes_select_analytics" ON "public"."ai_chat_themes" FOR SELECT USING (("public"."has_company_permission"("company_id", 'page.analytics'::"text") OR "public"."is_superadmin"("auth"."uid"())));



ALTER TABLE "public"."ai_token_usage_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_invite_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_licenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_user_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cron_locks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."licenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manual_chunks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manual_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manuals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."manual_views";



REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT ALL ON SCHEMA "public" TO "anon";
GRANT ALL ON SCHEMA "public" TO "authenticated";
GRANT ALL ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."delete_user"("target_user_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_monthly_token_usage"("company_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_token_usage"("company_id_param" "uuid") TO "service_role";



GRANT SELECT ON TABLE "public"."ai_chat_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_chat_sessions" TO "service_role";



GRANT ALL ON FUNCTION "public"."match_manual_summaries_by_company"("company_id_param" "uuid", "query_embedding" "public"."vector", "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_manual_summaries_by_company"("company_id_param" "uuid", "query_embedding" "public"."vector", "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_public_manual_summaries_by_company"("company_id_param" "uuid", "query_embedding" "public"."vector", "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_public_manual_summaries_by_company"("company_id_param" "uuid", "query_embedding" "public"."vector", "match_count" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."match_public_manual_summaries_by_company"("company_id_param" "uuid", "query_embedding" "public"."vector", "match_count" integer) TO "anon";


















GRANT SELECT ON TABLE "public"."ai_chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_chat_messages" TO "service_role";



GRANT SELECT ON TABLE "public"."ai_chat_themes" TO "anon";
GRANT SELECT ON TABLE "public"."ai_chat_themes" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."ai_chat_themes" TO "service_role";



GRANT SELECT ON TABLE "public"."ai_token_usage_logs" TO "authenticated";
GRANT SELECT ON TABLE "public"."ai_token_usage_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_token_usage_logs" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."companies" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."companies" TO "service_role";
GRANT SELECT ON TABLE "public"."companies" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."company_invite_permissions" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."company_invite_permissions" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."company_invites" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."company_invites" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."company_licenses" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."company_licenses" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."company_user_permissions" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."company_user_permissions" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."company_users" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."company_users" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."folders" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."folders" TO "service_role";
GRANT SELECT ON TABLE "public"."folders" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."licenses" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."licenses" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."manual_chunks" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."manual_chunks" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."manual_views" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."manual_views" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."manuals" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."manuals" TO "service_role";
GRANT SELECT ON TABLE "public"."manuals" TO "anon";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."permissions" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."permissions" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "anon";


































drop extension if exists "pg_net";

revoke delete on table "public"."ai_chat_messages" from "anon";

revoke insert on table "public"."ai_chat_messages" from "anon";

revoke references on table "public"."ai_chat_messages" from "anon";

revoke select on table "public"."ai_chat_messages" from "anon";

revoke trigger on table "public"."ai_chat_messages" from "anon";

revoke truncate on table "public"."ai_chat_messages" from "anon";

revoke update on table "public"."ai_chat_messages" from "anon";

revoke delete on table "public"."ai_chat_messages" from "authenticated";

revoke insert on table "public"."ai_chat_messages" from "authenticated";

revoke references on table "public"."ai_chat_messages" from "authenticated";

revoke trigger on table "public"."ai_chat_messages" from "authenticated";

revoke truncate on table "public"."ai_chat_messages" from "authenticated";

revoke update on table "public"."ai_chat_messages" from "authenticated";

revoke delete on table "public"."ai_chat_sessions" from "anon";

revoke insert on table "public"."ai_chat_sessions" from "anon";

revoke references on table "public"."ai_chat_sessions" from "anon";

revoke select on table "public"."ai_chat_sessions" from "anon";

revoke trigger on table "public"."ai_chat_sessions" from "anon";

revoke truncate on table "public"."ai_chat_sessions" from "anon";

revoke update on table "public"."ai_chat_sessions" from "anon";

revoke delete on table "public"."ai_chat_sessions" from "authenticated";

revoke insert on table "public"."ai_chat_sessions" from "authenticated";

revoke references on table "public"."ai_chat_sessions" from "authenticated";

revoke trigger on table "public"."ai_chat_sessions" from "authenticated";

revoke truncate on table "public"."ai_chat_sessions" from "authenticated";

revoke update on table "public"."ai_chat_sessions" from "authenticated";

revoke delete on table "public"."ai_chat_themes" from "anon";

revoke insert on table "public"."ai_chat_themes" from "anon";

revoke references on table "public"."ai_chat_themes" from "anon";

revoke trigger on table "public"."ai_chat_themes" from "anon";

revoke truncate on table "public"."ai_chat_themes" from "anon";

revoke update on table "public"."ai_chat_themes" from "anon";

revoke delete on table "public"."ai_chat_themes" from "authenticated";

revoke insert on table "public"."ai_chat_themes" from "authenticated";

revoke references on table "public"."ai_chat_themes" from "authenticated";

revoke trigger on table "public"."ai_chat_themes" from "authenticated";

revoke truncate on table "public"."ai_chat_themes" from "authenticated";

revoke update on table "public"."ai_chat_themes" from "authenticated";

revoke references on table "public"."ai_chat_themes" from "service_role";

revoke trigger on table "public"."ai_chat_themes" from "service_role";

revoke truncate on table "public"."ai_chat_themes" from "service_role";

revoke delete on table "public"."ai_token_usage_logs" from "anon";

revoke insert on table "public"."ai_token_usage_logs" from "anon";

revoke references on table "public"."ai_token_usage_logs" from "anon";

revoke trigger on table "public"."ai_token_usage_logs" from "anon";

revoke truncate on table "public"."ai_token_usage_logs" from "anon";

revoke update on table "public"."ai_token_usage_logs" from "anon";

revoke delete on table "public"."ai_token_usage_logs" from "authenticated";

revoke insert on table "public"."ai_token_usage_logs" from "authenticated";

revoke references on table "public"."ai_token_usage_logs" from "authenticated";

revoke trigger on table "public"."ai_token_usage_logs" from "authenticated";

revoke truncate on table "public"."ai_token_usage_logs" from "authenticated";

revoke update on table "public"."ai_token_usage_logs" from "authenticated";

revoke delete on table "public"."companies" from "anon";

revoke insert on table "public"."companies" from "anon";

revoke references on table "public"."companies" from "anon";

revoke trigger on table "public"."companies" from "anon";

revoke truncate on table "public"."companies" from "anon";

revoke update on table "public"."companies" from "anon";

revoke references on table "public"."companies" from "authenticated";

revoke trigger on table "public"."companies" from "authenticated";

revoke truncate on table "public"."companies" from "authenticated";

revoke references on table "public"."companies" from "service_role";

revoke trigger on table "public"."companies" from "service_role";

revoke truncate on table "public"."companies" from "service_role";

revoke delete on table "public"."company_invite_permissions" from "anon";

revoke insert on table "public"."company_invite_permissions" from "anon";

revoke references on table "public"."company_invite_permissions" from "anon";

revoke select on table "public"."company_invite_permissions" from "anon";

revoke trigger on table "public"."company_invite_permissions" from "anon";

revoke truncate on table "public"."company_invite_permissions" from "anon";

revoke update on table "public"."company_invite_permissions" from "anon";

revoke references on table "public"."company_invite_permissions" from "authenticated";

revoke trigger on table "public"."company_invite_permissions" from "authenticated";

revoke truncate on table "public"."company_invite_permissions" from "authenticated";

revoke references on table "public"."company_invite_permissions" from "service_role";

revoke trigger on table "public"."company_invite_permissions" from "service_role";

revoke truncate on table "public"."company_invite_permissions" from "service_role";

revoke delete on table "public"."company_invites" from "anon";

revoke insert on table "public"."company_invites" from "anon";

revoke references on table "public"."company_invites" from "anon";

revoke select on table "public"."company_invites" from "anon";

revoke trigger on table "public"."company_invites" from "anon";

revoke truncate on table "public"."company_invites" from "anon";

revoke update on table "public"."company_invites" from "anon";

revoke references on table "public"."company_invites" from "authenticated";

revoke trigger on table "public"."company_invites" from "authenticated";

revoke truncate on table "public"."company_invites" from "authenticated";

revoke references on table "public"."company_invites" from "service_role";

revoke trigger on table "public"."company_invites" from "service_role";

revoke truncate on table "public"."company_invites" from "service_role";

revoke delete on table "public"."company_licenses" from "anon";

revoke insert on table "public"."company_licenses" from "anon";

revoke references on table "public"."company_licenses" from "anon";

revoke select on table "public"."company_licenses" from "anon";

revoke trigger on table "public"."company_licenses" from "anon";

revoke truncate on table "public"."company_licenses" from "anon";

revoke update on table "public"."company_licenses" from "anon";

revoke references on table "public"."company_licenses" from "authenticated";

revoke trigger on table "public"."company_licenses" from "authenticated";

revoke truncate on table "public"."company_licenses" from "authenticated";

revoke references on table "public"."company_licenses" from "service_role";

revoke trigger on table "public"."company_licenses" from "service_role";

revoke truncate on table "public"."company_licenses" from "service_role";

revoke delete on table "public"."company_user_permissions" from "anon";

revoke insert on table "public"."company_user_permissions" from "anon";

revoke references on table "public"."company_user_permissions" from "anon";

revoke select on table "public"."company_user_permissions" from "anon";

revoke trigger on table "public"."company_user_permissions" from "anon";

revoke truncate on table "public"."company_user_permissions" from "anon";

revoke update on table "public"."company_user_permissions" from "anon";

revoke references on table "public"."company_user_permissions" from "authenticated";

revoke trigger on table "public"."company_user_permissions" from "authenticated";

revoke truncate on table "public"."company_user_permissions" from "authenticated";

revoke references on table "public"."company_user_permissions" from "service_role";

revoke trigger on table "public"."company_user_permissions" from "service_role";

revoke truncate on table "public"."company_user_permissions" from "service_role";

revoke delete on table "public"."company_users" from "anon";

revoke insert on table "public"."company_users" from "anon";

revoke references on table "public"."company_users" from "anon";

revoke select on table "public"."company_users" from "anon";

revoke trigger on table "public"."company_users" from "anon";

revoke truncate on table "public"."company_users" from "anon";

revoke update on table "public"."company_users" from "anon";

revoke references on table "public"."company_users" from "authenticated";

revoke trigger on table "public"."company_users" from "authenticated";

revoke truncate on table "public"."company_users" from "authenticated";

revoke references on table "public"."company_users" from "service_role";

revoke trigger on table "public"."company_users" from "service_role";

revoke truncate on table "public"."company_users" from "service_role";

revoke delete on table "public"."cron_locks" from "anon";

revoke insert on table "public"."cron_locks" from "anon";

revoke references on table "public"."cron_locks" from "anon";

revoke select on table "public"."cron_locks" from "anon";

revoke trigger on table "public"."cron_locks" from "anon";

revoke truncate on table "public"."cron_locks" from "anon";

revoke update on table "public"."cron_locks" from "anon";

revoke delete on table "public"."cron_locks" from "authenticated";

revoke insert on table "public"."cron_locks" from "authenticated";

revoke references on table "public"."cron_locks" from "authenticated";

revoke select on table "public"."cron_locks" from "authenticated";

revoke trigger on table "public"."cron_locks" from "authenticated";

revoke truncate on table "public"."cron_locks" from "authenticated";

revoke update on table "public"."cron_locks" from "authenticated";

revoke delete on table "public"."cron_locks" from "service_role";

revoke insert on table "public"."cron_locks" from "service_role";

revoke references on table "public"."cron_locks" from "service_role";

revoke select on table "public"."cron_locks" from "service_role";

revoke trigger on table "public"."cron_locks" from "service_role";

revoke truncate on table "public"."cron_locks" from "service_role";

revoke update on table "public"."cron_locks" from "service_role";

revoke delete on table "public"."folders" from "anon";

revoke insert on table "public"."folders" from "anon";

revoke references on table "public"."folders" from "anon";

revoke trigger on table "public"."folders" from "anon";

revoke truncate on table "public"."folders" from "anon";

revoke update on table "public"."folders" from "anon";

revoke references on table "public"."folders" from "authenticated";

revoke trigger on table "public"."folders" from "authenticated";

revoke truncate on table "public"."folders" from "authenticated";

revoke references on table "public"."folders" from "service_role";

revoke trigger on table "public"."folders" from "service_role";

revoke truncate on table "public"."folders" from "service_role";

revoke delete on table "public"."licenses" from "anon";

revoke insert on table "public"."licenses" from "anon";

revoke references on table "public"."licenses" from "anon";

revoke select on table "public"."licenses" from "anon";

revoke trigger on table "public"."licenses" from "anon";

revoke truncate on table "public"."licenses" from "anon";

revoke update on table "public"."licenses" from "anon";

revoke references on table "public"."licenses" from "authenticated";

revoke trigger on table "public"."licenses" from "authenticated";

revoke truncate on table "public"."licenses" from "authenticated";

revoke references on table "public"."licenses" from "service_role";

revoke trigger on table "public"."licenses" from "service_role";

revoke truncate on table "public"."licenses" from "service_role";

revoke delete on table "public"."manual_chunks" from "anon";

revoke insert on table "public"."manual_chunks" from "anon";

revoke references on table "public"."manual_chunks" from "anon";

revoke select on table "public"."manual_chunks" from "anon";

revoke trigger on table "public"."manual_chunks" from "anon";

revoke truncate on table "public"."manual_chunks" from "anon";

revoke update on table "public"."manual_chunks" from "anon";

revoke references on table "public"."manual_chunks" from "authenticated";

revoke trigger on table "public"."manual_chunks" from "authenticated";

revoke truncate on table "public"."manual_chunks" from "authenticated";

revoke references on table "public"."manual_chunks" from "service_role";

revoke trigger on table "public"."manual_chunks" from "service_role";

revoke truncate on table "public"."manual_chunks" from "service_role";

revoke delete on table "public"."manual_views" from "anon";

revoke insert on table "public"."manual_views" from "anon";

revoke references on table "public"."manual_views" from "anon";

revoke select on table "public"."manual_views" from "anon";

revoke trigger on table "public"."manual_views" from "anon";

revoke truncate on table "public"."manual_views" from "anon";

revoke update on table "public"."manual_views" from "anon";

revoke references on table "public"."manual_views" from "authenticated";

revoke trigger on table "public"."manual_views" from "authenticated";

revoke truncate on table "public"."manual_views" from "authenticated";

revoke references on table "public"."manual_views" from "service_role";

revoke trigger on table "public"."manual_views" from "service_role";

revoke truncate on table "public"."manual_views" from "service_role";

revoke delete on table "public"."manuals" from "anon";

revoke insert on table "public"."manuals" from "anon";

revoke references on table "public"."manuals" from "anon";

revoke trigger on table "public"."manuals" from "anon";

revoke truncate on table "public"."manuals" from "anon";

revoke update on table "public"."manuals" from "anon";

revoke references on table "public"."manuals" from "authenticated";

revoke trigger on table "public"."manuals" from "authenticated";

revoke truncate on table "public"."manuals" from "authenticated";

revoke references on table "public"."manuals" from "service_role";

revoke trigger on table "public"."manuals" from "service_role";

revoke truncate on table "public"."manuals" from "service_role";

revoke delete on table "public"."permissions" from "anon";

revoke insert on table "public"."permissions" from "anon";

revoke references on table "public"."permissions" from "anon";

revoke select on table "public"."permissions" from "anon";

revoke trigger on table "public"."permissions" from "anon";

revoke truncate on table "public"."permissions" from "anon";

revoke update on table "public"."permissions" from "anon";

revoke references on table "public"."permissions" from "authenticated";

revoke trigger on table "public"."permissions" from "authenticated";

revoke truncate on table "public"."permissions" from "authenticated";

revoke references on table "public"."permissions" from "service_role";

revoke trigger on table "public"."permissions" from "service_role";

revoke truncate on table "public"."permissions" from "service_role";

revoke delete on table "public"."profiles" from "anon";

revoke insert on table "public"."profiles" from "anon";

revoke references on table "public"."profiles" from "anon";

revoke trigger on table "public"."profiles" from "anon";

revoke truncate on table "public"."profiles" from "anon";

revoke update on table "public"."profiles" from "anon";

revoke references on table "public"."profiles" from "authenticated";

revoke trigger on table "public"."profiles" from "authenticated";

revoke truncate on table "public"."profiles" from "authenticated";

revoke references on table "public"."profiles" from "service_role";

revoke trigger on table "public"."profiles" from "service_role";

revoke truncate on table "public"."profiles" from "service_role";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "Company members can delete company logos"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'company-logos'::text) AND public.has_company_permission(((storage.foldername(name))[1])::uuid, 'page.portal'::text)));



  create policy "Company members can update company logos"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'company-logos'::text) AND public.has_company_permission(((storage.foldername(name))[1])::uuid, 'page.portal'::text)));



  create policy "Company members can upload company logos"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'company-logos'::text) AND public.has_company_permission(((storage.foldername(name))[1])::uuid, 'page.portal'::text)));



  create policy "Logos are publicly accessible"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'company-logos'::text));



  create policy "Users can delete their own manuals"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'manuals'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can update their own manuals"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'manuals'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can upload their own manuals"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'manuals'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



  create policy "Users can view their own manuals"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'manuals'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));



