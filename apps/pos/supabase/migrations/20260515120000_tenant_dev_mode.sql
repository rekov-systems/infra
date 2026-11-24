-- Add dev_mode flag to tenants. When enabled, the tenant can sell regardless of inventory stock.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS dev_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.dev_mode IS
  'Development / testing mode: skips stock validation on sales. Only owner/super_admin can toggle.';
