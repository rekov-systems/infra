-- Product description and sort_order for customizable menu display
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Public storage bucket for product images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Tenant members can upload and delete their own product images
CREATE POLICY "tenant members can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND public.is_tenant_member(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "tenant members can update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.is_tenant_member(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "tenant members can delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.is_tenant_member(auth.uid(), (storage.foldername(name))[1]::uuid)
);

-- Public read (bucket is public, but explicit policy for safety)
CREATE POLICY "product images are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');
