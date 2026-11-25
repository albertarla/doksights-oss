-- Revert manuals bucket to only allow PDFs, keeping the 20MB limit
UPDATE storage.buckets
SET 
  allowed_mime_types = ARRAY['application/pdf'],
  file_size_limit = 20971520
WHERE id = 'manuals';
