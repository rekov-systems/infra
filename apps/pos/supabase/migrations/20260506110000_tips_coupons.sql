-- Update sales_channel enum
DO $$ BEGIN
  ALTER TYPE public.sales_channel ADD VALUE IF NOT EXISTS 'tables';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add tip_amount to sales
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS tip_amount NUMERIC NOT NULL DEFAULT 0;

-- Discount codes table
CREATE TABLE IF NOT EXISTS public.discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percentage', -- percentage | fixed
  discount_value NUMERIC NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  current_uses INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

-- Loyalty Points System
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS points_per_thousand INTEGER NOT NULL DEFAULT 10; -- Example: 10 points for every $1.000
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS receipt_config JSONB NOT NULL DEFAULT '{ "show_logo": true, "show_tax_details": true, "show_customer_info": true, "header_text": "", "footer_text": "", "font_size": "small" }'::jsonb;

CREATE POLICY "discount_codes_select" ON public.discount_codes FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "discount_codes_all" ON public.discount_codes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]));

-- Enhanced Cash Sessions (for reconciliation)
ALTER TABLE public.cash_sessions ADD COLUMN IF NOT EXISTS counted_cash NUMERIC;
ALTER TABLE public.cash_sessions ADD COLUMN IF NOT EXISTS counted_card NUMERIC;
ALTER TABLE public.cash_sessions ADD COLUMN IF NOT EXISTS counted_transfer NUMERIC;
ALTER TABLE public.cash_sessions ADD COLUMN IF NOT EXISTS counted_qr NUMERIC;
