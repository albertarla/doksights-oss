-- Migration: Add web_manual_images table for tracking images uploaded to web manuals.
-- Images are stored in the `manuals` storage bucket under `web_images/{manual_id}/`.
-- The `manuals.file_size` column is updated on upload/delete of images.

CREATE TABLE IF NOT EXISTS public.web_manual_images (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id    UUID NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  file_size    BIGINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.web_manual_images ENABLE ROW LEVEL SECURITY;

-- Members with page.manuals permission can read/write images for their company's manuals.
CREATE POLICY "manuals_members_can_select_web_images"
  ON public.web_manual_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.manuals m
      WHERE m.id = web_manual_images.manual_id
        AND public.is_company_member(m.company_id)
    )
    OR
    public.is_superadmin(auth.uid())
  );

CREATE POLICY "manuals_members_can_insert_web_images"
  ON public.web_manual_images
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manuals m
      WHERE m.id = web_manual_images.manual_id
        AND public.has_company_permission(m.company_id, 'page.manuals')
    )
  );

CREATE POLICY "manuals_members_can_delete_web_images"
  ON public.web_manual_images
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.manuals m
      WHERE m.id = web_manual_images.manual_id
        AND public.has_company_permission(m.company_id, 'page.manuals')
    )
    OR
    public.is_superadmin(auth.uid())
  );

-- Index for fast lookups by manual_id
CREATE INDEX IF NOT EXISTS idx_web_manual_images_manual_id
  ON public.web_manual_images(manual_id);
