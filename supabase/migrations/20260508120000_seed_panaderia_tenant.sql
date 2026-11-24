-- ═══════════════════════════════════════════════════════════════════════════════
-- Tenant seed: La Panadería
-- Instancia de producción desplegada en Dokploy, proyecto poss360t.
--
-- IMPORTANTE: tras asignar el dominio en Dokploy ejecutar:
--   UPDATE public.tenants
--   SET domain = '<hostname-asignado-en-dokploy>'
--   WHERE slug = 'panaderia';
--
-- Branding "Tierra y Moderno":
--   primary_color = '#BF7B1E'  (trigo dorado)
--   theme_kind    = 'bakery'   → activa [data-tenant-theme="bakery"] en el CSS
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant_id   UUID;
  v_branch_id   UUID;

  v_cat_pan     UUID;
  v_cat_pastry  UUID;
  v_cat_bebida  UUID;
  v_cat_torta   UUID;

  v_prod_mogolla    UUID;
  v_prod_croissant  UUID;
  v_prod_almojabana UUID;
  v_prod_pandebono  UUID;
  v_prod_torta      UUID;
  v_prod_cafe       UUID;
  v_prod_jugo       UUID;
BEGIN

  -- ── 1. Tenant ──────────────────────────────────────────────────────────────
  INSERT INTO public.tenants (name, slug, currency, tax_rate, primary_color, theme_kind)
  VALUES ('La Panadería', 'panaderia', 'COP', 0, '#BF7B1E', 'bakery')
  ON CONFLICT (slug) DO UPDATE
    SET primary_color = EXCLUDED.primary_color,
        theme_kind    = EXCLUDED.theme_kind
  RETURNING id INTO v_tenant_id;

  -- ── 2. Sucursal ────────────────────────────────────────────────────────────
  INSERT INTO public.branches (tenant_id, name, address, phone)
  VALUES (v_tenant_id, 'Local Principal', '', '')
  RETURNING id INTO v_branch_id;

  -- ── 3. Centro de inventario ────────────────────────────────────────────────
  INSERT INTO public.inventory_centers (tenant_id, branch_id, name, type)
  VALUES (v_tenant_id, v_branch_id, 'Bodega Principal', 'point_of_sale');

  -- ── 4. Categorías ─────────────────────────────────────────────────────────
  INSERT INTO public.categories (tenant_id, name, color)
  VALUES (v_tenant_id, 'Pan', '#BF7B1E')       RETURNING id INTO v_cat_pan;

  INSERT INTO public.categories (tenant_id, name, color)
  VALUES (v_tenant_id, 'Pastelería', '#C4813A') RETURNING id INTO v_cat_pastry;

  INSERT INTO public.categories (tenant_id, name, color)
  VALUES (v_tenant_id, 'Tortas', '#8B5120')     RETURNING id INTO v_cat_torta;

  INSERT INTO public.categories (tenant_id, name, color)
  VALUES (v_tenant_id, 'Bebidas', '#6B4226')    RETURNING id INTO v_cat_bebida;

  -- ── 5. Productos base ─────────────────────────────────────────────────────
  INSERT INTO public.products (tenant_id, category_id, name, price, cost, product_type)
  VALUES (v_tenant_id, v_cat_pan, 'Mogolla', 400, 150, 'simple')
  RETURNING id INTO v_prod_mogolla;

  INSERT INTO public.products (tenant_id, category_id, name, price, cost, product_type)
  VALUES (v_tenant_id, v_cat_pastry, 'Croissant', 3500, 1200, 'simple')
  RETURNING id INTO v_prod_croissant;

  INSERT INTO public.products (tenant_id, category_id, name, price, cost, product_type)
  VALUES (v_tenant_id, v_cat_pan, 'Almojábana', 1500, 600, 'simple')
  RETURNING id INTO v_prod_almojabana;

  INSERT INTO public.products (tenant_id, category_id, name, price, cost, product_type)
  VALUES (v_tenant_id, v_cat_pan, 'Pandebono', 1800, 700, 'simple')
  RETURNING id INTO v_prod_pandebono;

  INSERT INTO public.products (tenant_id, category_id, name, price, cost, product_type)
  VALUES (v_tenant_id, v_cat_torta, 'Torta de Chocolate (porción)', 8000, 3000, 'simple')
  RETURNING id INTO v_prod_torta;

  INSERT INTO public.products (tenant_id, category_id, name, price, cost, product_type)
  VALUES (v_tenant_id, v_cat_bebida, 'Tinto', 2000, 500, 'simple')
  RETURNING id INTO v_prod_cafe;

  INSERT INTO public.products (tenant_id, category_id, name, price, cost, product_type)
  VALUES (v_tenant_id, v_cat_bebida, 'Jugo Natural', 4500, 1800, 'simple')
  RETURNING id INTO v_prod_jugo;

  -- ── 6. Asignar productos a la sucursal ────────────────────────────────────
  INSERT INTO public.branch_products (tenant_id, branch_id, product_id)
  VALUES
    (v_tenant_id, v_branch_id, v_prod_mogolla),
    (v_tenant_id, v_branch_id, v_prod_croissant),
    (v_tenant_id, v_branch_id, v_prod_almojabana),
    (v_tenant_id, v_branch_id, v_prod_pandebono),
    (v_tenant_id, v_branch_id, v_prod_torta),
    (v_tenant_id, v_branch_id, v_prod_cafe),
    (v_tenant_id, v_branch_id, v_prod_jugo);

  -- ── 7. Precios por canal (apps de delivery llevan comisión → precio mayor) ─
  INSERT INTO public.product_channel_prices (tenant_id, product_id, channel, price)
  VALUES
    (v_tenant_id, v_prod_mogolla,    'pos',      400),
    (v_tenant_id, v_prod_mogolla,    'delivery', 400),
    (v_tenant_id, v_prod_mogolla,    'rappi',    500),
    (v_tenant_id, v_prod_mogolla,    'didi',     500),
    (v_tenant_id, v_prod_mogolla,    'uber',     500),

    (v_tenant_id, v_prod_croissant,  'pos',      3500),
    (v_tenant_id, v_prod_croissant,  'delivery', 3500),
    (v_tenant_id, v_prod_croissant,  'rappi',    4200),
    (v_tenant_id, v_prod_croissant,  'didi',     4200),
    (v_tenant_id, v_prod_croissant,  'uber',     4200),

    (v_tenant_id, v_prod_almojabana, 'pos',      1500),
    (v_tenant_id, v_prod_almojabana, 'delivery', 1500),
    (v_tenant_id, v_prod_almojabana, 'rappi',    1900),
    (v_tenant_id, v_prod_almojabana, 'didi',     1900),
    (v_tenant_id, v_prod_almojabana, 'uber',     1900),

    (v_tenant_id, v_prod_pandebono,  'pos',      1800),
    (v_tenant_id, v_prod_pandebono,  'delivery', 1800),
    (v_tenant_id, v_prod_pandebono,  'rappi',    2200),
    (v_tenant_id, v_prod_pandebono,  'didi',     2200),
    (v_tenant_id, v_prod_pandebono,  'uber',     2200),

    (v_tenant_id, v_prod_torta,      'pos',      8000),
    (v_tenant_id, v_prod_torta,      'delivery', 8000),
    (v_tenant_id, v_prod_torta,      'rappi',    9500),
    (v_tenant_id, v_prod_torta,      'didi',     9500),
    (v_tenant_id, v_prod_torta,      'uber',     9500),

    (v_tenant_id, v_prod_cafe,       'pos',      2000),
    (v_tenant_id, v_prod_cafe,       'delivery', 2000),

    (v_tenant_id, v_prod_jugo,       'pos',      4500),
    (v_tenant_id, v_prod_jugo,       'delivery', 4500),
    (v_tenant_id, v_prod_jugo,       'rappi',    5500),
    (v_tenant_id, v_prod_jugo,       'didi',     5500),
    (v_tenant_id, v_prod_jugo,       'uber',     5500);

END $$;

-- ── 8. Usuario owner de la panadería ──────────────────────────────────────────
-- Requiere la extensión pgcrypto habilitada (disponible en Supabase por defecto).
-- Cambiar el email y contraseña antes de ejecutar.
DO $$
DECLARE
  v_user_id   UUID := gen_random_uuid();
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'panaderia';

  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at, updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated', 'authenticated',
    'admin@panaderia.local',
    crypt('CambiarEsta2026!', gen_salt('bf')),
    now(),
    '{"full_name": "Admin Panadería"}'::jsonb,
    now(), now()
  )
  ON CONFLICT (email) DO NOTHING;

  -- Recuperar el id si ya existía
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'admin@panaderia.local';

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (v_user_id, v_tenant_id, 'owner')
  ON CONFLICT DO NOTHING;
END $$;
