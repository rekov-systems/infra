-- ═══════════════════════════════════════════════════════════════════════════════
-- Usuarios demo por rol — instancia panadería
-- Contraseña común: Demo2026!   (owner: CambiarEsta2026!)
-- Emails en auth.users: @demos360t  (ej: admin@demos360t, cajero@demos360t)
-- Solo para desarrollo / demo. Eliminar en producción real.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant_id UUID;
  u_id        UUID;
  demo_pwd    TEXT := crypt('Demo2026!', gen_salt('bf'));
  roles_data  RECORD;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'panaderia';

  FOR roles_data IN SELECT * FROM (VALUES
    ('admin.demo@panaderia.local', 'Admin Demo',       'admin'::app_role),
    ('gerente@panaderia.local',    'Gerente Demo',     'manager'::app_role),
    ('cajero@panaderia.local',     'Cajero Demo',      'cashier'::app_role),
    ('cocina@panaderia.local',     'Cocina Demo',      'kitchen'::app_role),
    ('inventario@panaderia.local', 'Inventario Demo',  'inventory'::app_role),
    ('mesero@panaderia.local',     'Mesero Demo',      'waiter'::app_role),
    ('repartidor@panaderia.local', 'Repartidor Demo',  'courier'::app_role)
  ) AS t(email, full_name, rol)
  LOOP
    SELECT id INTO u_id FROM auth.users WHERE email = roles_data.email;

    IF u_id IS NULL THEN
      u_id := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role,
        email, encrypted_password,
        email_confirmed_at,
        confirmation_token, recovery_token,
        email_change_token_new, reauthentication_token,
        raw_user_meta_data,
        created_at, updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        u_id, 'authenticated', 'authenticated',
        roles_data.email,
        demo_pwd,
        now(),
        '', '', '', '',
        jsonb_build_object('full_name', roles_data.full_name),
        now(), now()
      );
    END IF;

    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (u_id, v_tenant_id, roles_data.rol)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
