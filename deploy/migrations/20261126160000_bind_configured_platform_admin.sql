-- Bind the Infisical-managed Rekov admin even if another super_admin role exists.
CREATE OR REPLACE FUNCTION public.rms_bootstrap_platform_admin(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _platform_tenant uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT id INTO _platform_tenant FROM public.tenants WHERE slug = 'rekov-platform';
  IF _platform_tenant IS NULL THEN
    INSERT INTO public.tenants (name, slug, currency, tax_rate, status)
    VALUES ('Rekov Systems', 'rekov-platform', 'COP', 0, 'active')
    RETURNING id INTO _platform_tenant;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE tenant_id = _platform_tenant
      AND user_id = _user_id
      AND role = 'super_admin'::public.app_role
  ) THEN
    INSERT INTO public.user_roles (tenant_id, user_id, role, branch_id)
    VALUES (_platform_tenant, _user_id, 'super_admin'::public.app_role, NULL);
  END IF;

  UPDATE public.profiles
  SET default_tenant_id = _platform_tenant, updated_at = now()
  WHERE id = _user_id;

  RETURN _platform_tenant;
END;
$$;
REVOKE ALL ON FUNCTION public.rms_bootstrap_platform_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rms_bootstrap_platform_admin(uuid) TO service_role;
