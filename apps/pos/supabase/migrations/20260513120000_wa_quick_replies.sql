-- Quick replies for WhatsApp inbox operators
CREATE TABLE IF NOT EXISTS public.wa_quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wa_quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_qr_member_select" ON public.wa_quick_replies
FOR SELECT TO authenticated
USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "wa_qr_admin_all" ON public.wa_quick_replies
FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]));

-- Updated_at trigger
CREATE OR REPLACE TRIGGER wa_quick_replies_updated_at
  BEFORE UPDATE ON public.wa_quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
