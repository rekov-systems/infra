-- Platform-level tenant provisioning. Kept outside apps/pos so upstream stays clean.

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
    SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role
  ) THEN
    INSERT INTO public.user_roles (tenant_id, user_id, role, branch_id)
    VALUES (_platform_tenant, _user_id, 'super_admin'::public.app_role, NULL)
    ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET default_tenant_id = _platform_tenant, updated_at = now()
    WHERE id = _user_id;
  END IF;

  RETURN _platform_tenant;
END;
$$;
REVOKE ALL ON FUNCTION public.rms_bootstrap_platform_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rms_bootstrap_platform_admin(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rms_create_tenant_with_owner(
  _name text,
  _slug text,
  _domain text,
  _branch_name text,
  _owner_id uuid
)
RETURNS TABLE(tenant_id uuid, branch_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _branch uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF NULLIF(trim(_name), '') IS NULL OR NULLIF(trim(_slug), '') IS NULL OR _owner_id IS NULL THEN
    RAISE EXCEPTION 'Business name, slug, and owner are required';
  END IF;

  INSERT INTO public.tenants (name, slug, domain, currency, tax_rate, status)
  VALUES (trim(_name), lower(trim(_slug)), lower(trim(_domain)), 'COP', 19, 'active')
  RETURNING id INTO _tenant;

  INSERT INTO public.branches (tenant_id, name, status)
  VALUES (_tenant, COALESCE(NULLIF(trim(_branch_name), ''), 'Sucursal principal'), 'active')
  RETURNING id INTO _branch;

  INSERT INTO public.cash_registers (tenant_id, branch_id, name, status)
  VALUES (_tenant, _branch, 'Caja 1', 'active');

  INSERT INTO public.user_roles (tenant_id, user_id, role, branch_id)
  VALUES (_tenant, _owner_id, 'owner'::public.app_role, NULL);

  UPDATE public.profiles
  SET default_tenant_id = _tenant, default_branch_id = _branch, updated_at = now()
  WHERE id = _owner_id;

  RETURN QUERY SELECT _tenant, _branch;
END;
$$;
REVOKE ALL ON FUNCTION public.rms_create_tenant_with_owner(text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rms_create_tenant_with_owner(text,text,text,text,uuid) TO service_role;
