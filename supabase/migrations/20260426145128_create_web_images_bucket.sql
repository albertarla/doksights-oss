-- Create a new public bucket for web manual images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
  'web_images', 
  'web_images', 
  true, 
  20971520, 
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
);

-- RLS for the web_images bucket

-- Allow public read access to all web images
CREATE POLICY "Public Web Images Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'web_images');

-- Allow authenticated users to upload their own images
CREATE POLICY "Users can upload their own web images" 
ON storage.objects FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'web_images' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own images
CREATE POLICY "Users can update their own web images" 
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'web_images' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own images
CREATE POLICY "Users can delete their own web images" 
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'web_images' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);
