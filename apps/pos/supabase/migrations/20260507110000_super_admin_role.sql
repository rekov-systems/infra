-- Add super_admin role for the S360T internal team
-- This role bypasses all tenant-level RLS checks and has unrestricted access

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Update has_role to grant access if the user holds super_admin in any tenant
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _tenant_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        (tenant_id = _tenant_id AND role = _role)
        OR role = 'super_admin'
      )
  )
$$;

-- Update has_any_role to grant access if the user holds super_admin in any tenant
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _tenant_id UUID, _roles app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        (tenant_id = _tenant_id AND role = ANY(_roles))
        OR role = 'super_admin'
      )
  )
$$;
