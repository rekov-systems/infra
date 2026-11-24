-- Estabilización POS/KDS/QR:
-- - Persistencia de modificadores y complementarios
-- - QR self-ordering mínimo
-- - Relaciones necesarias para PostgREST/KDS
-- - Usuarios demo alineados con accesos rápidos

ALTER TABLE public.table_orders
  ALTER COLUMN waiter_id DROP NOT NULL;

ALTER TABLE public.table_order_items
  ADD COLUMN IF NOT EXISTS modifiers jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS modifiers jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.digital_order_items
  ADD COLUMN IF NOT EXISTS modifiers jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS schedule_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_from text,
  ADD COLUMN IF NOT EXISTS schedule_until text,
  ADD COLUMN IF NOT EXISTS schedule_days integer[];

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS station text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'table_order_items_order_id_fkey'
  ) THEN
    ALTER TABLE public.table_order_items
      ADD CONSTRAINT table_order_items_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.table_orders(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'table_orders_table_id_fkey'
  ) THEN
    ALTER TABLE public.table_orders
      ADD CONSTRAINT table_orders_table_id_fkey
      FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  min_selections integer NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
  max_selections integer NOT NULL DEFAULT 1 CHECK (max_selections >= 1),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_selections <= max_selections)
);

CREATE INDEX IF NOT EXISTS idx_modifier_groups_product ON public.modifier_groups(product_id, sort_order);
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS modifier_groups_member_select ON public.modifier_groups;
CREATE POLICY modifier_groups_member_select
ON public.modifier_groups
FOR SELECT TO authenticated
USING (public.is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS modifier_groups_manager_all ON public.modifier_groups;
CREATE POLICY modifier_groups_manager_all
ON public.modifier_groups
FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]));

DROP TRIGGER IF EXISTS trg_modifier_groups_updated ON public.modifier_groups;
CREATE TRIGGER trg_modifier_groups_updated
  BEFORE UPDATE ON public.modifier_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.modifier_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta numeric NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modifier_options_group ON public.modifier_options(group_id, sort_order);
ALTER TABLE public.modifier_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS modifier_options_member_select ON public.modifier_options;
CREATE POLICY modifier_options_member_select
ON public.modifier_options
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.modifier_groups mg
    WHERE mg.id = group_id
      AND public.is_tenant_member(auth.uid(), mg.tenant_id)
  )
);

DROP POLICY IF EXISTS modifier_options_manager_all ON public.modifier_options;
CREATE POLICY modifier_options_manager_all
ON public.modifier_options
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.modifier_groups mg
    WHERE mg.id = group_id
      AND public.has_any_role(auth.uid(), mg.tenant_id, ARRAY['owner','admin','manager']::public.app_role[])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.modifier_groups mg
    WHERE mg.id = group_id
      AND public.has_any_role(auth.uid(), mg.tenant_id, ARRAY['owner','admin','manager']::public.app_role[])
  )
);

DROP TRIGGER IF EXISTS trg_modifier_options_updated ON public.modifier_options;
CREATE TRIGGER trg_modifier_options_updated
  BEFORE UPDATE ON public.modifier_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.product_complementaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  complementary_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, complementary_id),
  CHECK (product_id <> complementary_id)
);

CREATE INDEX IF NOT EXISTS idx_product_complementaries_product
  ON public.product_complementaries(product_id, sort_order);
ALTER TABLE public.product_complementaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_complementaries_member_select ON public.product_complementaries;
CREATE POLICY product_complementaries_member_select
ON public.product_complementaries
FOR SELECT TO authenticated
USING (public.is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS product_complementaries_manager_all ON public.product_complementaries;
CREATE POLICY product_complementaries_manager_all
ON public.product_complementaries
FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.get_branch_menu(_branch_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH branch_row AS (
    SELECT b.id, b.tenant_id, b.name, t.name AS tenant_name
    FROM public.branches b
    JOIN public.tenants t ON t.id = b.tenant_id
    WHERE b.id = _branch_id
      AND b.status = 'active'
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM branch_row) THEN NULL
    ELSE jsonb_build_object(
      'branch', (
        SELECT jsonb_build_object(
          'id', id,
          'name', name,
          'tenant_id', tenant_id,
          'tenant_name', tenant_name
        )
        FROM branch_row
      ),
      'categories', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'color', c.color,
            'schedule_enabled', c.schedule_enabled,
            'schedule_from', c.schedule_from,
            'schedule_until', c.schedule_until,
            'schedule_days', c.schedule_days,
            'products', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', p.id,
                  'name', p.name,
                  'price', COALESCE(bp.local_price, p.price),
                  'tax_rate', p.tax_rate,
                  'image_url', p.image_url
                )
                ORDER BY p.name
              )
              FROM public.products p
              LEFT JOIN public.branch_products bp
                ON bp.product_id = p.id AND bp.branch_id = _branch_id
              WHERE p.tenant_id = c.tenant_id
                AND p.category_id = c.id
                AND p.status = 'active'
                AND p.product_type <> 'ingredient'
                AND COALESCE(bp.is_available, true) = true
            ), '[]'::jsonb)
          )
          ORDER BY c.sort_order, c.name
        )
        FROM public.categories c
        JOIN branch_row br ON br.tenant_id = c.tenant_id
        WHERE c.status = 'active'
      ), '[]'::jsonb)
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.create_qr_order(
  _branch_id uuid,
  _items jsonb,
  _table_id uuid DEFAULT NULL,
  _customer_name text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
  _order_id uuid;
  _digital_order_id uuid;
  _item jsonb;
  _product record;
  _line_subtotal numeric;
  _line_tax numeric;
  _line_total numeric;
  _gross numeric := 0;
BEGIN
  SELECT tenant_id INTO _tenant_id
  FROM public.branches
  WHERE id = _branch_id AND status = 'active';
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Sucursal no disponible';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'El pedido no tiene items';
  END IF;

  IF _table_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tables
      WHERE id = _table_id AND branch_id = _branch_id AND status <> 'inactive'
    ) THEN
      RAISE EXCEPTION 'Mesa no disponible';
    END IF;

    SELECT id INTO _order_id
    FROM public.table_orders
    WHERE table_id = _table_id AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;

    IF _order_id IS NULL THEN
      INSERT INTO public.table_orders
        (tenant_id, branch_id, table_id, waiter_id, status, notes)
      VALUES
        (_tenant_id, _branch_id, _table_id, NULL, 'open',
         concat_ws(E'\n', NULLIF(_customer_name, ''), NULLIF(_notes, ''), '[QR]'))
      RETURNING id INTO _order_id;
    END IF;

    FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
      SELECT p.id, p.name, p.product_type, p.price, p.tax_rate, COALESCE(bp.local_price, p.price) AS final_price
      INTO _product
      FROM public.products p
      LEFT JOIN public.branch_products bp
        ON bp.product_id = p.id AND bp.branch_id = _branch_id
      WHERE p.id = (_item->>'product_id')::uuid
        AND p.tenant_id = _tenant_id
        AND p.status = 'active'
        AND COALESCE(bp.is_available, true) = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Producto no disponible'; END IF;

      _line_subtotal := GREATEST(((_item->>'quantity')::numeric * _product.final_price), 0);
      _line_tax := _line_subtotal * COALESCE(_product.tax_rate, 0) / 100.0;
      _line_total := _line_subtotal + _line_tax;

      INSERT INTO public.table_order_items
        (tenant_id, order_id, product_id, product_name, product_type, quantity, unit_price, tax_rate, discount, line_total, modifiers, status)
      VALUES
        (_tenant_id, _order_id, _product.id, _product.name, _product.product_type,
         (_item->>'quantity')::numeric, _product.final_price, COALESCE(_product.tax_rate, 0),
         0, _line_total, COALESCE(_item->'modifiers', '[]'::jsonb), 'pending');
    END LOOP;

    PERFORM public.recalc_table_order(_order_id);
    UPDATE public.tables SET status = 'occupied' WHERE id = _table_id;
    RETURN _order_id;
  END IF;

  INSERT INTO public.digital_orders
    (tenant_id, branch_id, channel, external_order_number, gross_total, platform_commission, net_total, status, notes, user_id)
  VALUES
    (_tenant_id, _branch_id, 'delivery'::public.sales_channel, 'QR-' || upper(substr(gen_random_uuid()::text, 1, 8)),
     0, 0, 0, 'received', concat_ws(E'\n', NULLIF(_customer_name, ''), NULLIF(_notes, ''), '[QR]'), NULL)
  RETURNING id INTO _digital_order_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT p.id, p.name, p.price, p.tax_rate, COALESCE(bp.local_price, p.price) AS final_price
    INTO _product
    FROM public.products p
    LEFT JOIN public.branch_products bp
      ON bp.product_id = p.id AND bp.branch_id = _branch_id
    WHERE p.id = (_item->>'product_id')::uuid
      AND p.tenant_id = _tenant_id
      AND p.status = 'active'
      AND COALESCE(bp.is_available, true) = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no disponible'; END IF;

    _line_subtotal := GREATEST(((_item->>'quantity')::numeric * _product.final_price), 0);
    _line_tax := _line_subtotal * COALESCE(_product.tax_rate, 0) / 100.0;
    _line_total := _line_subtotal + _line_tax;
    _gross := _gross + _line_total;

    INSERT INTO public.digital_order_items
      (tenant_id, digital_order_id, product_id, product_name, quantity, unit_price, tax_rate, discount, line_total, modifiers, raw_payload)
    VALUES
      (_tenant_id, _digital_order_id, _product.id, _product.name,
       (_item->>'quantity')::numeric, _product.final_price, COALESCE(_product.tax_rate, 0),
       0, _line_total, COALESCE(_item->'modifiers', '[]'::jsonb), _item);
  END LOOP;

  UPDATE public.digital_orders
     SET gross_total = _gross, net_total = _gross
   WHERE id = _digital_order_id;

  RETURN _digital_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_branch_menu(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_qr_order(uuid, jsonb, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.checkout_sale(
  _tenant_id uuid,
  _branch_id uuid,
  _items jsonb,
  _payments jsonb,
  _discount_total numeric DEFAULT 0,
  _notes text DEFAULT NULL,
  _customer_id uuid DEFAULT NULL,
  _channel public.sales_channel DEFAULT 'pos',
  _tip_amount numeric DEFAULT 0,
  _coupon_code text DEFAULT NULL,
  _client_mutation_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _session_id uuid;
  _sale_id uuid;
  _existing_sale_id uuid;
  _subtotal numeric := 0;
  _tax_total numeric := 0;
  _coupon_discount numeric := COALESCE(_discount_total, 0);
  _total numeric := 0;
  _payment_total numeric := 0;
  _item jsonb;
  _pay jsonb;
  _line_subtotal numeric;
  _line_tax numeric;
  _line_total numeric;
  _product record;
  _component record;
  _coupon public.discount_codes;
  _points_config integer;
  _points_earned integer;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_branch_role(_user_id, _tenant_id, _branch_id, ARRAY['owner','admin','manager','cashier','waiter']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'La venta no tiene items';
  END IF;

  IF _client_mutation_id IS NOT NULL THEN
    SELECT id INTO _existing_sale_id
    FROM public.sales
    WHERE tenant_id = _tenant_id AND client_mutation_id = _client_mutation_id;
    IF _existing_sale_id IS NOT NULL THEN
      RETURN _existing_sale_id;
    END IF;
  END IF;

  _payments := COALESCE(_payments, '[]'::jsonb);

  IF _channel IN ('pos','tables') THEN
    SELECT id INTO _session_id
    FROM public.cash_sessions
    WHERE branch_id = _branch_id AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;
    IF _session_id IS NULL THEN
      RAISE EXCEPTION 'No hay caja abierta en esta sucursal. Abre caja antes de vender.';
    END IF;
  ELSE
    _session_id := NULL;
  END IF;

  INSERT INTO public.sales (
    tenant_id, branch_id, session_id, user_id, customer_id,
    subtotal, tax_total, discount_total, total, notes, channel,
    tip_amount, coupon_code, client_mutation_id
  )
  VALUES (
    _tenant_id, _branch_id, _session_id, _user_id, _customer_id,
    0, 0, 0, 0, _notes, _channel,
    GREATEST(COALESCE(_tip_amount, 0), 0), NULLIF(upper(trim(COALESCE(_coupon_code, ''))), ''), _client_mutation_id
  )
  RETURNING id INTO _sale_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT id, name, product_type, tax_rate INTO _product
    FROM public.products
    WHERE id = (_item->>'product_id')::uuid AND tenant_id = _tenant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', _item->>'product_id'; END IF;
    IF COALESCE((_item->>'quantity')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;

    _line_subtotal := (_item->>'quantity')::numeric * (_item->>'unit_price')::numeric
      - COALESCE((_item->>'discount')::numeric, 0);
    IF _line_subtotal < 0 THEN _line_subtotal := 0; END IF;
    _line_tax := _line_subtotal * COALESCE((_item->>'tax_rate')::numeric, _product.tax_rate, 0) / 100.0;
    _line_total := _line_subtotal + _line_tax;

    INSERT INTO public.sale_items
      (tenant_id, sale_id, product_id, product_name, product_type, quantity, unit_price, tax_rate, discount, line_total, modifiers)
    VALUES
      (_tenant_id, _sale_id, _product.id, _product.name, _product.product_type,
       (_item->>'quantity')::numeric, (_item->>'unit_price')::numeric,
       COALESCE((_item->>'tax_rate')::numeric, _product.tax_rate, 0),
       COALESCE((_item->>'discount')::numeric, 0), _line_total, COALESCE(_item->'modifiers', '[]'::jsonb));

    _subtotal := _subtotal + _line_subtotal;
    _tax_total := _tax_total + _line_tax;

    IF _product.product_type IN ('simple','production','combo') THEN
      PERFORM public.apply_inventory_movement(
        _tenant_id, _branch_id, _product.id, 'sale'::public.movement_type,
        (_item->>'quantity')::numeric, _channel || ' sale', 'sale', _sale_id, _user_id, NULL
      );
    ELSIF _product.product_type = 'composite' THEN
      FOR _component IN
        SELECT component_product_id, quantity, COALESCE(waste_pct, 0) AS waste_pct
        FROM public.product_components
        WHERE parent_product_id = _product.id
      LOOP
        PERFORM public.apply_inventory_movement(
          _tenant_id, _branch_id, _component.component_product_id, 'consumption'::public.movement_type,
          _component.quantity * (_item->>'quantity')::numeric * (1 + _component.waste_pct / 100.0),
          'Composite ' || _channel, 'sale', _sale_id, _user_id, NULL
        );
      END LOOP;
    END IF;
  END LOOP;

  IF NULLIF(trim(COALESCE(_coupon_code, '')), '') IS NOT NULL THEN
    SELECT * INTO _coupon
    FROM public.discount_codes
    WHERE tenant_id = _tenant_id
      AND upper(code) = upper(trim(_coupon_code))
      AND is_active = true
      AND starts_at <= now()
      AND (expires_at IS NULL OR expires_at >= now())
      AND (max_uses IS NULL OR current_uses < max_uses)
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cupón inválido o vencido';
    END IF;

    IF _coupon.discount_type = 'percentage' THEN
      _coupon_discount := round((_subtotal + _tax_total) * (_coupon.discount_value / 100.0), 2);
    ELSE
      _coupon_discount := _coupon.discount_value;
    END IF;
    _coupon_discount := LEAST(GREATEST(COALESCE(_coupon_discount, 0), 0), _subtotal + _tax_total);

    UPDATE public.discount_codes
       SET current_uses = current_uses + 1
     WHERE id = _coupon.id;
  ELSE
    _coupon_discount := LEAST(GREATEST(COALESCE(_coupon_discount, 0), 0), _subtotal + _tax_total);
  END IF;

  _total := _subtotal + _tax_total - _coupon_discount + GREATEST(COALESCE(_tip_amount, 0), 0);
  SELECT COALESCE(sum((p->>'amount')::numeric), 0)
    INTO _payment_total
  FROM jsonb_array_elements(_payments) AS p;

  IF (_channel IN ('pos','tables') OR jsonb_array_length(_payments) > 0)
     AND abs(_payment_total - _total) > 0.01 THEN
    RAISE EXCEPTION 'Los pagos (%) no coinciden con el total (%)', _payment_total, _total;
  END IF;

  UPDATE public.sales
     SET subtotal = _subtotal,
         tax_total = _tax_total,
         discount_total = _coupon_discount,
         total = _total
   WHERE id = _sale_id;

  FOR _pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    INSERT INTO public.payments (tenant_id, sale_id, method, amount, reference)
    VALUES (_tenant_id, _sale_id, (_pay->>'method')::public.payment_method,
            (_pay->>'amount')::numeric, _pay->>'reference');

    IF _session_id IS NOT NULL THEN
      UPDATE public.cash_sessions SET
        total_cash = total_cash + CASE WHEN _pay->>'method' = 'cash' THEN (_pay->>'amount')::numeric ELSE 0 END,
        total_card = total_card + CASE WHEN _pay->>'method' = 'card' THEN (_pay->>'amount')::numeric ELSE 0 END,
        total_transfer = total_transfer + CASE WHEN _pay->>'method' = 'transfer' THEN (_pay->>'amount')::numeric ELSE 0 END,
        total_qr = total_qr + CASE WHEN _pay->>'method' = 'qr' THEN (_pay->>'amount')::numeric ELSE 0 END
      WHERE id = _session_id;
    END IF;
  END LOOP;

  IF _customer_id IS NOT NULL THEN
    SELECT points_per_thousand INTO _points_config FROM public.tenants WHERE id = _tenant_id;
    _points_earned := floor(_total / 1000) * COALESCE(_points_config, 0);
    IF _points_earned > 0 THEN
      UPDATE public.customers
         SET loyalty_points = loyalty_points + _points_earned
       WHERE id = _customer_id;
    END IF;
  END IF;

  IF _client_mutation_id IS NOT NULL THEN
    INSERT INTO public.operation_log (tenant_id, branch_id, operation_type, client_mutation_id, entity_type, entity_id, payload)
    VALUES (_tenant_id, _branch_id, 'checkout_sale', _client_mutation_id, 'sales', _sale_id, jsonb_build_object('channel', _channel, 'total', _total))
    ON CONFLICT (tenant_id, client_mutation_id) DO NOTHING;
  END IF;

  RETURN _sale_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.checkout_table_order(
  _order_id uuid,
  _payments jsonb,
  _tip_amount numeric DEFAULT 0,
  _discount_total numeric DEFAULT 0,
  _coupon_code text DEFAULT NULL,
  _client_mutation_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _o public.table_orders;
  _user_id uuid := auth.uid();
  _sale_id uuid;
  _items jsonb;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _o FROM public.table_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_branch_role(_user_id, _o.tenant_id, _o.branch_id, ARRAY['owner','admin','manager','cashier','waiter']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _o.status NOT IN ('open','sent_to_cashier') THEN RAISE EXCEPTION 'Order not payable'; END IF;

  UPDATE public.table_order_items
     SET status = 'cancelled'
   WHERE order_id = _order_id AND status = 'pending';

  PERFORM public.recalc_table_order(_order_id);

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id,
    'quantity', quantity,
    'unit_price', unit_price,
    'tax_rate', tax_rate,
    'discount', discount,
    'modifiers', modifiers
  ))
  INTO _items
  FROM public.table_order_items
  WHERE order_id = _order_id AND status = 'dispatched';

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'La mesa no tiene items despachados para cobrar';
  END IF;

  _sale_id := public.checkout_sale(
    _o.tenant_id,
    _o.branch_id,
    _items,
    _payments,
    _discount_total,
    COALESCE(_o.notes, '') || ' [Mesa]',
    NULL,
    'tables'::public.sales_channel,
    _tip_amount,
    _coupon_code,
    COALESCE(_client_mutation_id, 'table:' || _order_id::text)
  );

  UPDATE public.table_orders
     SET status = 'closed', closed_at = now(), sale_id = _sale_id
   WHERE id = _order_id;

  UPDATE public.tables
     SET status = 'available'
   WHERE id = _o.table_id;

  RETURN _sale_id;
END;
$$;

DO $$
DECLARE
  v_tenant_id uuid;
  u_id uuid;
  demo_pwd text := crypt('Demo2026!', gen_salt('bf'));
  roles_data record;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'panaderia';
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  FOR roles_data IN SELECT * FROM (VALUES
    ('admin.demo@panaderia.local', 'Admin Demo', 'admin'::public.app_role),
    ('mesero@panaderia.local', 'Mesero Demo', 'waiter'::public.app_role),
    ('repartidor@panaderia.local', 'Repartidor Demo', 'courier'::public.app_role)
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

    DELETE FROM public.user_roles
    WHERE user_id = u_id
      AND tenant_id = v_tenant_id
      AND role = 'staff'::public.app_role
      AND roles_data.rol IN ('waiter'::public.app_role, 'courier'::public.app_role);

    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (u_id, v_tenant_id, roles_data.rol)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
