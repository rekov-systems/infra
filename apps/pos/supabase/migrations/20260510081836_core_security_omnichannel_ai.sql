-- Enum values must be committed before later migrations can safely reference them.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'courier';
ALTER TYPE public.sale_status ADD VALUE IF NOT EXISTS 'partially_refunded';
ALTER TYPE public.sales_channel ADD VALUE IF NOT EXISTS 'whatsapp';
ALTER TYPE public.sales_channel ADD VALUE IF NOT EXISTS 'didi';
ALTER TYPE public.sales_channel ADD VALUE IF NOT EXISTS 'uber';
