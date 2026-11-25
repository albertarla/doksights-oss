-- Grant permissions to the authenticated and service_role for web_manual_images table
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.web_manual_images TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.web_manual_images TO service_role;
