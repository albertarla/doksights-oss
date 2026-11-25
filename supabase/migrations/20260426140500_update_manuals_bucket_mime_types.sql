-- Update the manuals bucket to allow image uploads in addition to PDFs
UPDATE storage.buckets
SET 
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  file_size_limit = 20971520
WHERE id = 'manuals';
