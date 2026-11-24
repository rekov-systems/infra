
-- Fix mutable search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

-- Tighten tenants insert policy: require an authenticated user (auth.uid not null)
DROP POLICY IF EXISTS "tenants_authenticated_insert" ON public.tenants;
CREATE POLICY "tenants_authenticated_insert" ON public.tenants
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
