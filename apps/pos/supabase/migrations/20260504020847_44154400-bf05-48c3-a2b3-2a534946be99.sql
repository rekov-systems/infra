
-- 1) rappi_integrations
CREATE TABLE public.rappi_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL UNIQUE,
  store_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  auto_accept BOOLEAN NOT NULL DEFAULT false,
  prep_time_min INTEGER NOT NULL DEFAULT 15,
  last_menu_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rappi_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rappi_integrations_member_select" ON public.rappi_integrations
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "rappi_integrations_mgr_all" ON public.rappi_integrations
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]));
CREATE TRIGGER trg_rappi_integrations_updated BEFORE UPDATE ON public.rappi_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_rappi_integrations_store ON public.rappi_integrations(store_id);

-- 2) rappi_webhook_logs
CREATE TABLE public.rappi_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  branch_id UUID,
  store_id TEXT,
  event_type TEXT,
  rappi_order_id TEXT,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'received',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rappi_webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rappi_logs_member_select" ON public.rappi_webhook_logs
  FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX idx_rappi_logs_created ON public.rappi_webhook_logs(created_at DESC);
CREATE INDEX idx_rappi_logs_branch ON public.rappi_webhook_logs(branch_id);

-- 3) extend digital_orders
ALTER TABLE public.digital_orders
  ADD COLUMN IF NOT EXISTS external_status TEXT,
  ADD COLUMN IF NOT EXISTS external_payload JSONB,
  ADD COLUMN IF NOT EXISTS rappi_order_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_digital_orders_rappi_order
  ON public.digital_orders(rappi_order_id) WHERE rappi_order_id IS NOT NULL;

-- 4) realtime
ALTER TABLE public.digital_orders REPLICA IDENTITY FULL;
ALTER TABLE public.rappi_webhook_logs REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.digital_orders;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rappi_webhook_logs;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
