-- Add manual_type column
ALTER TABLE "public"."manuals" 
  ADD COLUMN "manual_type" text NOT NULL DEFAULT 'pdf' CHECK ("manual_type" IN ('pdf', 'web'));

-- Make PDF-specific columns nullable
ALTER TABLE "public"."manuals" 
  ALTER COLUMN "file_path" DROP NOT NULL,
  ALTER COLUMN "file_name" DROP NOT NULL,
  ALTER COLUMN "file_size" DROP NOT NULL;

-- Ensure data consistency based on manual type
ALTER TABLE "public"."manuals"
  ADD CONSTRAINT "manuals_pdf_fields_check" 
  CHECK (
    (manual_type = 'pdf' AND file_path IS NOT NULL AND file_name IS NOT NULL AND file_size IS NOT NULL)
    OR 
    (manual_type = 'web')
  );

-- Create manual_sections table
CREATE TABLE IF NOT EXISTS "public"."manual_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "manual_id" "uuid" NOT NULL REFERENCES "public"."manuals"("id") ON DELETE CASCADE,
    "title" "text" NOT NULL DEFAULT 'Untitled Section',
    "content" "text" NOT NULL DEFAULT '',
    "display_order" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    PRIMARY KEY ("id")
);

-- Enable RLS
ALTER TABLE "public"."manual_sections" ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- 1. Members with page.manuals can manage (insert/update/delete) manual sections
CREATE POLICY "Users with page.manuals can manage sections" ON "public"."manual_sections"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manuals m
      JOIN public.company_users cu ON cu.company_id = m.company_id
      JOIN public.company_user_permissions cup ON cup.company_user_id = cu.id
      WHERE m.id = manual_sections.manual_id
      AND cu.user_id = auth.uid()
      AND cu.status = 'active'
      AND cup.permission_key = 'page.manuals'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manuals m
      JOIN public.company_users cu ON cu.company_id = m.company_id
      JOIN public.company_user_permissions cup ON cup.company_user_id = cu.id
      WHERE m.id = manual_sections.manual_id
      AND cu.user_id = auth.uid()
      AND cu.status = 'active'
      AND cup.permission_key = 'page.manuals'
    )
  );

-- 2. Any active member can read their company's manual sections
CREATE POLICY "Company members can read sections" ON "public"."manual_sections"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manuals m
      JOIN public.company_users cu ON cu.company_id = m.company_id
      WHERE m.id = manual_sections.manual_id
      AND cu.user_id = auth.uid()
      AND cu.status = 'active'
    )
  );

-- 3. Public access via portal
CREATE POLICY "Public can read sections of public manuals" ON "public"."manual_sections"
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.manuals m
      JOIN public.companies c ON c.id = m.company_id
      WHERE m.id = manual_sections.manual_id
      AND m.is_public = true
      AND c.portal_enabled = true
    )
  );

-- 4. Superadmin bypass
CREATE POLICY "Superadmins can manage all manual sections" ON "public"."manual_sections"
  FOR ALL
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER "set_updated_at" 
  BEFORE UPDATE ON "public"."manual_sections" 
  FOR EACH ROW 
  EXECUTE FUNCTION "public"."update_updated_at_column"();
