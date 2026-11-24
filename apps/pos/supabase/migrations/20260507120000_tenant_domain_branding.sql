-- Add white-label / domain-based branding fields to tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS domain       text UNIQUE,
  ADD COLUMN IF NOT EXISTS logo_url     text,
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#f97316',
  ADD COLUMN IF NOT EXISTS theme_kind   text DEFAULT 'bar'
    CHECK (theme_kind IN ('bakery', 'bar'));

COMMENT ON COLUMN public.tenants.domain IS
  'Hostname used to resolve this tenant (e.g. "acme.localhost", "panaderia.com").';
COMMENT ON COLUMN public.tenants.theme_kind IS
  'Visual theme preset. Values: bakery | bar.';
