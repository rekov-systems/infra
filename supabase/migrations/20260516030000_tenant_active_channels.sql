-- Migration to add active_channels to tenants

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS active_channels sales_channel[] DEFAULT ARRAY['pos', 'tables', 'delivery', 'qr']::sales_channel[];

COMMENT ON COLUMN tenants.active_channels IS 'Array of active sales channels enabled for the tenant by the super admin.';
