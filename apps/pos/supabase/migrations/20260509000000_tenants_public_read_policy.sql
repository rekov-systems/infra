-- Allow unauthenticated (anon) clients to read tenants that have a domain
-- configured. This is required by useTenantByDomain, which runs before login
-- to resolve branding. Without this policy, RLS blocks the query and the app
-- shows "Instancia no configurada" to every visitor.
CREATE POLICY "tenants_public_read_by_domain"
ON public.tenants
FOR SELECT
TO anon, authenticated
USING (domain IS NOT NULL);
