-- =========================
-- Seguridad base: bootstrap cerrado, roles por sucursal y helpers
-- =========================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _tenant_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = 'super_admin'::public.app_role
        OR (tenant_id = _tenant_id AND role = _role)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _tenant_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = 'super_admin'::public.app_role
        OR (tenant_id = _tenant_id AND role = ANY(_roles))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = 'super_admin'::public.app_role OR tenant_id = _tenant_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_branch_role(
  _user_id uuid,
  _tenant_id uuid,
  _branch_id uuid,
  _roles public.app_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = 'super_admin'::public.app_role
        OR (
          tenant_id = _tenant_id
          AND role = ANY(_roles)
          AND (branch_id IS NULL OR branch_id = _branch_id)
        )
      )
  );
$$;

DROP POLICY IF EXISTS "tenants_authenticated_insert" ON public.tenants;
DROP POLICY IF EXISTS "tenants_no_client_insert" ON public.tenants;
CREATE POLICY "tenants_no_client_insert"
ON public.tenants
FOR INSERT TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "roles_self_first_insert" ON public.user_roles;
DROP POLICY IF EXISTS "roles_admin_insert" ON public.user_roles;
CREATE POLICY "roles_admin_insert"
ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.bootstrap_first_tenant(
  _name text,
  _branch_name text DEFAULT 'Barra principal',
  _tax_rate numeric DEFAULT 19,
  _slug text DEFAULT NULL
)
RETURNS TABLE(tenant_id uuid, branch_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _tenant_id uuid;
  _branch_id uuid;
  _slug_value text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants LIMIT 1) THEN
    RAISE EXCEPTION 'Bootstrap cerrado: el primer negocio ya existe';
  END IF;
  IF length(trim(COALESCE(_name, ''))) = 0 THEN
    RAISE EXCEPTION 'El nombre del negocio es requerido';
  END IF;

  _slug_value := COALESCE(
    NULLIF(trim(_slug), ''),
    trim(both '-' from regexp_replace(lower(_name), '[^a-z0-9]+', '-', 'g'))
  );

  INSERT INTO public.tenants (name, slug, tax_rate)
  VALUES (trim(_name), NULLIF(_slug_value, ''), COALESCE(_tax_rate, 0))
  RETURNING id INTO _tenant_id;

  INSERT INTO public.branches (tenant_id, name)
  VALUES (_tenant_id, COALESCE(NULLIF(trim(_branch_name), ''), 'Barra principal'))
  RETURNING id INTO _branch_id;

  INSERT INTO public.user_roles (tenant_id, user_id, role, branch_id)
  VALUES (_tenant_id, _user_id, 'owner'::public.app_role, NULL);

  INSERT INTO public.cash_registers (tenant_id, branch_id, name)
  VALUES (_tenant_id, _branch_id, 'Caja 1');

  UPDATE public.profiles
     SET default_tenant_id = _tenant_id,
         default_branch_id = _branch_id,
         updated_at = now()
   WHERE id = _user_id;

  tenant_id := _tenant_id;
  branch_id := _branch_id;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_bootstrap_available()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.tenants LIMIT 1);
$$;

UPDATE public.user_roles ur
SET role = 'courier'::public.app_role
FROM public.profiles p
WHERE p.id = ur.user_id
  AND ur.role = 'staff'::public.app_role
  AND p.email ILIKE 'repartidor@%';

-- =========================
-- Tablas/columnas core
-- =========================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS allow_negative_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS return_supervisor_threshold numeric NOT NULL DEFAULT 50000;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS tip_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS client_mutation_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_client_mutation
  ON public.sales(tenant_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

ALTER TABLE public.cash_sessions
  ADD COLUMN IF NOT EXISTS counted_cash numeric,
  ADD COLUMN IF NOT EXISTS counted_card numeric,
  ADD COLUMN IF NOT EXISTS counted_transfer numeric,
  ADD COLUMN IF NOT EXISTS counted_qr numeric;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_open_branch_without_register
  ON public.cash_sessions(tenant_id, branch_id)
  WHERE status = 'open' AND register_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_open_branch_register
  ON public.cash_sessions(tenant_id, branch_id, register_id)
  WHERE status = 'open' AND register_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.operation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  operation_type text NOT NULL,
  client_mutation_id text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  entity_type text,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, client_mutation_id)
);

ALTER TABLE public.operation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "operation_log_admin_select" ON public.operation_log;
CREATE POLICY "operation_log_admin_select"
ON public.operation_log
FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]));

ALTER TABLE public.sale_returns
  ADD COLUMN IF NOT EXISTS supervisor_user_id uuid,
  ADD COLUMN IF NOT EXISTS evidence_url text,
  ADD COLUMN IF NOT EXISTS refund_method text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'return-evidence',
  'return-evidence',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "return_evidence_tenant_select" ON storage.objects;
CREATE POLICY "return_evidence_tenant_select"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'return-evidence'
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM public.user_roles
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "return_evidence_tenant_insert" ON storage.objects;
CREATE POLICY "return_evidence_tenant_insert"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'return-evidence'
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text
    FROM public.user_roles
    WHERE user_id = auth.uid()
  )
);

-- =========================
-- Caja
-- =========================

DROP POLICY IF EXISTS "cash_sessions_member_select" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_member_all" ON public.cash_sessions;
CREATE POLICY "cash_sessions_branch_select"
ON public.cash_sessions
FOR SELECT TO authenticated
USING (public.has_branch_role(auth.uid(), tenant_id, branch_id, ARRAY['owner','admin','manager','cashier']::public.app_role[]));

CREATE POLICY "cash_sessions_branch_all"
ON public.cash_sessions
FOR ALL TO authenticated
USING (public.has_branch_role(auth.uid(), tenant_id, branch_id, ARRAY['owner','admin','manager','cashier']::public.app_role[]))
WITH CHECK (public.has_branch_role(auth.uid(), tenant_id, branch_id, ARRAY['owner','admin','manager','cashier']::public.app_role[]));

DROP POLICY IF EXISTS "cash_moves_member_select" ON public.cash_movements;
DROP POLICY IF EXISTS "cash_moves_member_all" ON public.cash_movements;
CREATE POLICY "cash_moves_branch_select"
ON public.cash_movements
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.cash_sessions s
    WHERE s.id = cash_movements.session_id
      AND public.has_branch_role(auth.uid(), cash_movements.tenant_id, s.branch_id, ARRAY['owner','admin','manager','cashier']::public.app_role[])
  )
);

CREATE POLICY "cash_moves_branch_all"
ON public.cash_movements
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.cash_sessions s
    WHERE s.id = cash_movements.session_id
      AND public.has_branch_role(auth.uid(), cash_movements.tenant_id, s.branch_id, ARRAY['owner','admin','manager','cashier']::public.app_role[])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.cash_sessions s
    WHERE s.id = cash_movements.session_id
      AND public.has_branch_role(auth.uid(), cash_movements.tenant_id, s.branch_id, ARRAY['owner','admin','manager','cashier']::public.app_role[])
  )
);

CREATE OR REPLACE FUNCTION public.open_cash_session(
  _tenant_id uuid,
  _branch_id uuid,
  _opening_amount numeric DEFAULT 0,
  _register_id uuid DEFAULT NULL
)
RETURNS public.cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _session public.cash_sessions;
BEGIN
  IF _user_id IS NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.has_branch_role(_user_id, _tenant_id, _branch_id, ARRAY['owner','admin','manager','cashier']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cash_sessions
    WHERE tenant_id = _tenant_id
      AND branch_id = _branch_id
      AND status = 'open'
      AND ((_register_id IS NULL AND register_id IS NULL) OR register_id = _register_id)
  ) THEN
    RAISE EXCEPTION 'Ya existe una caja abierta para esta sucursal/caja';
  END IF;

  INSERT INTO public.cash_sessions (tenant_id, branch_id, register_id, user_id, opening_amount)
  VALUES (_tenant_id, _branch_id, _register_id, _user_id, COALESCE(_opening_amount, 0))
  RETURNING * INTO _session;

  RETURN _session;
END;
$$;

DROP FUNCTION IF EXISTS public.close_cash_session(uuid, numeric, text);
CREATE OR REPLACE FUNCTION public.close_cash_session(
  _session_id uuid,
  _counted_amount numeric,
  _notes text DEFAULT NULL,
  _counted_card numeric DEFAULT NULL,
  _counted_transfer numeric DEFAULT NULL,
  _counted_qr numeric DEFAULT NULL
)
RETURNS public.cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s public.cash_sessions;
  _expected_cash numeric;
  _expected_total numeric;
  _counted_total numeric;
  _updated public.cash_sessions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _s FROM public.cash_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash session not found'; END IF;
  IF _s.status <> 'open' THEN RAISE EXCEPTION 'La caja ya está cerrada'; END IF;
  IF NOT public.has_branch_role(auth.uid(), _s.tenant_id, _s.branch_id, ARRAY['owner','admin','manager','cashier']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  _expected_cash := _s.opening_amount + _s.total_cash + _s.total_in - _s.total_out;
  _expected_total := _expected_cash + _s.total_card + _s.total_transfer + _s.total_qr;
  _counted_total :=
    COALESCE(_counted_amount, 0)
    + COALESCE(_counted_card, 0)
    + COALESCE(_counted_transfer, 0)
    + COALESCE(_counted_qr, 0);

  UPDATE public.cash_sessions
     SET status = 'closed',
         closed_at = now(),
         counted_cash = COALESCE(_counted_amount, 0),
         counted_card = COALESCE(_counted_card, 0),
         counted_transfer = COALESCE(_counted_transfer, 0),
         counted_qr = COALESCE(_counted_qr, 0),
         closing_amount = _counted_total,
         expected_amount = _expected_total,
         difference = _counted_total - _expected_total,
         notes = _notes
   WHERE id = _session_id
   RETURNING * INTO _updated;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, entity, entity_id, metadata)
  VALUES (
    _s.tenant_id,
    auth.uid(),
    'cash_session.closed',
    'cash_sessions',
    _session_id,
    jsonb_build_object('expected_total', _expected_total, 'counted_total', _counted_total)
  );

  RETURN _updated;
END;
$$;

-- =========================
-- Inventario atómico + stock negativo configurable
-- =========================

CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  _tenant_id uuid,
  _branch_id uuid,
  _product_id uuid,
  _movement_type public.movement_type,
  _quantity numeric,
  _reason text,
  _reference_type text,
  _reference_id uuid,
  _user_id uuid,
  _inventory_center_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _signed numeric;
  _movement_id uuid;
  _target_center_id uuid := _inventory_center_id;
  _new_quantity numeric;
  _allow_negative boolean;
BEGIN
  IF COALESCE(_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.has_branch_role(COALESCE(auth.uid(), _user_id), _tenant_id, _branch_id, ARRAY['owner','admin','manager','inventory','cashier','kitchen']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _target_center_id IS NULL THEN
    SELECT id INTO _target_center_id
    FROM public.inventory_centers
    WHERE branch_id = _branch_id AND status = 'active'
    ORDER BY (name = 'Bodega Principal') DESC, created_at ASC
    LIMIT 1;
  END IF;
  IF _target_center_id IS NULL THEN
    RAISE EXCEPTION 'No inventory center found for branch %', _branch_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_centers
    WHERE id = _target_center_id AND tenant_id = _tenant_id AND branch_id = _branch_id
  ) THEN
    RAISE EXCEPTION 'Centro de inventario inválido';
  END IF;

  _signed := CASE _movement_type
    WHEN 'purchase' THEN _quantity
    WHEN 'production' THEN _quantity
    WHEN 'return' THEN _quantity
    WHEN 'adjustment' THEN _quantity
    WHEN 'sale' THEN -_quantity
    WHEN 'waste' THEN -_quantity
    WHEN 'consumption' THEN -_quantity
    WHEN 'transfer' THEN -_quantity
  END;

  SELECT allow_negative_stock INTO _allow_negative FROM public.tenants WHERE id = _tenant_id;

  INSERT INTO public.inventory_stocks (tenant_id, branch_id, inventory_center_id, product_id, quantity)
  VALUES (_tenant_id, _branch_id, _target_center_id, _product_id, _signed)
  ON CONFLICT (inventory_center_id, product_id) DO UPDATE
    SET quantity = public.inventory_stocks.quantity + EXCLUDED.quantity,
        updated_at = now()
  RETURNING quantity INTO _new_quantity;

  IF NOT COALESCE(_allow_negative, false) AND _new_quantity < 0 THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto %', _product_id;
  END IF;

  INSERT INTO public.inventory_movements
    (tenant_id, branch_id, inventory_center_id, product_id, movement_type, quantity, reason, reference_type, reference_id, user_id)
  VALUES
    (_tenant_id, _branch_id, _target_center_id, _product_id, _movement_type, _quantity, _reason, _reference_type, _reference_id, _user_id)
  RETURNING id INTO _movement_id;

  RETURN _movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_inventory(
  _tenant_id uuid,
  _branch_id uuid,
  _product_id uuid,
  _from_center_id uuid,
  _to_center_id uuid,
  _quantity numeric,
  _reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _transfer_id uuid := gen_random_uuid();
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_branch_role(_user_id, _tenant_id, _branch_id, ARRAY['owner','admin','manager','inventory']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _from_center_id = _to_center_id THEN
    RAISE EXCEPTION 'El centro de origen y destino deben ser diferentes';
  END IF;

  PERFORM public.apply_inventory_movement(
    _tenant_id, _branch_id, _product_id, 'transfer'::public.movement_type, _quantity,
    COALESCE(_reason, 'Transferencia de inventario'), 'inventory_transfer', _transfer_id, _user_id, _from_center_id
  );
  PERFORM public.apply_inventory_movement(
    _tenant_id, _branch_id, _product_id, 'adjustment'::public.movement_type, _quantity,
    COALESCE(_reason, 'Transferencia de inventario'), 'inventory_transfer', _transfer_id, _user_id, _to_center_id
  );

  INSERT INTO public.audit_logs (tenant_id, user_id, action, entity, entity_id, metadata)
  VALUES (
    _tenant_id,
    _user_id,
    'inventory.transfer',
    'inventory_movements',
    _transfer_id,
    jsonb_build_object('product_id', _product_id, 'from_center_id', _from_center_id, 'to_center_id', _to_center_id, 'quantity', _quantity)
  );

  RETURN _transfer_id;
END;
$$;

-- =========================
-- Checkout POS / mesas con propina, cupón, validación e idempotencia
-- =========================

DROP FUNCTION IF EXISTS public.checkout_sale(uuid, uuid, jsonb, jsonb, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.checkout_sale(uuid, uuid, jsonb, jsonb, numeric, text, uuid, public.sales_channel);
DROP FUNCTION IF EXISTS public.checkout_sale(uuid, uuid, jsonb, jsonb, numeric, text, uuid, public.sales_channel, numeric);

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
      (tenant_id, sale_id, product_id, product_name, product_type, quantity, unit_price, tax_rate, discount, line_total)
    VALUES
      (_tenant_id, _sale_id, _product.id, _product.name, _product.product_type,
       (_item->>'quantity')::numeric, (_item->>'unit_price')::numeric,
       COALESCE((_item->>'tax_rate')::numeric, _product.tax_rate, 0),
       COALESCE((_item->>'discount')::numeric, 0), _line_total);

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

DROP FUNCTION IF EXISTS public.checkout_table_order(uuid, jsonb);
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
    'discount', discount
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

-- =========================
-- Omnicanal: órdenes digitales primero, venta al confirmar
-- =========================

CREATE TABLE IF NOT EXISTS public.digital_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  digital_order_id uuid NOT NULL REFERENCES public.digital_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  external_product_id text,
  product_name text NOT NULL,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_digital_order_items_order ON public.digital_order_items(digital_order_id);
ALTER TABLE public.digital_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "digital_order_items_member_select" ON public.digital_order_items;
CREATE POLICY "digital_order_items_member_select"
ON public.digital_order_items
FOR SELECT TO authenticated
USING (public.is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "digital_order_items_member_all" ON public.digital_order_items;
CREATE POLICY "digital_order_items_member_all"
ON public.digital_order_items
FOR ALL TO authenticated
USING (public.is_tenant_member(auth.uid(), tenant_id))
WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

DROP FUNCTION IF EXISTS public.register_digital_order(uuid, uuid, public.sales_channel, text, jsonb, numeric, text);
CREATE OR REPLACE FUNCTION public.register_digital_order(
  _tenant_id uuid,
  _branch_id uuid,
  _channel public.sales_channel,
  _external_no text,
  _items jsonb,
  _commission numeric DEFAULT 0,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _order_id uuid;
  _item jsonb;
  _product record;
  _line_total numeric;
  _gross numeric := 0;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_branch_role(_user_id, _tenant_id, _branch_id, ARRAY['owner','admin','manager','cashier']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _channel NOT IN ('rappi','delivery','whatsapp','didi','uber') THEN
    RAISE EXCEPTION 'Invalid digital channel';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'El pedido digital no tiene items';
  END IF;

  INSERT INTO public.digital_orders
    (tenant_id, branch_id, channel, external_order_number, gross_total, platform_commission, net_total, status, notes, user_id)
  VALUES
    (_tenant_id, _branch_id, _channel, NULLIF(_external_no, ''), 0, COALESCE(_commission, 0), 0, 'received', _notes, _user_id)
  RETURNING id INTO _order_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT id, name, tax_rate INTO _product
    FROM public.products
    WHERE id = (_item->>'product_id')::uuid AND tenant_id = _tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', _item->>'product_id'; END IF;

    _line_total :=
      ((_item->>'quantity')::numeric * (_item->>'unit_price')::numeric)
      - COALESCE((_item->>'discount')::numeric, 0);
    _line_total := _line_total + (_line_total * COALESCE((_item->>'tax_rate')::numeric, _product.tax_rate, 0) / 100.0);
    _gross := _gross + _line_total;

    INSERT INTO public.digital_order_items
      (tenant_id, digital_order_id, product_id, product_name, quantity, unit_price, tax_rate, discount, line_total, raw_payload)
    VALUES
      (_tenant_id, _order_id, _product.id, _product.name,
       (_item->>'quantity')::numeric, (_item->>'unit_price')::numeric,
       COALESCE((_item->>'tax_rate')::numeric, _product.tax_rate, 0),
       COALESCE((_item->>'discount')::numeric, 0), _line_total, _item);
  END LOOP;

  UPDATE public.digital_orders
     SET gross_total = _gross,
         net_total = GREATEST(_gross - COALESCE(_commission, 0), 0)
   WHERE id = _order_id;

  RETURN _order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_digital_order(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _o public.digital_orders;
  _sale_id uuid;
  _items jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _o FROM public.digital_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Digital order not found'; END IF;
  IF NOT public.has_branch_role(auth.uid(), _o.tenant_id, _o.branch_id, ARRAY['owner','admin','manager','cashier']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _o.sale_id IS NOT NULL THEN
    RETURN _o.sale_id;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id,
    'quantity', quantity,
    'unit_price', unit_price,
    'tax_rate', tax_rate,
    'discount', discount
  ))
  INTO _items
  FROM public.digital_order_items
  WHERE digital_order_id = _order_id AND product_id IS NOT NULL;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'El pedido no tiene items vinculados al catálogo';
  END IF;

  _sale_id := public.checkout_sale(
    _o.tenant_id,
    _o.branch_id,
    _items,
    '[]'::jsonb,
    0,
    _o.notes,
    NULL,
    _o.channel,
    0,
    NULL,
    'digital:' || _order_id::text
  );

  UPDATE public.digital_orders
     SET sale_id = _sale_id,
         status = 'confirmed'
   WHERE id = _order_id;

  RETURN _sale_id;
END;
$$;

-- =========================
-- Devoluciones auditadas
-- =========================

CREATE OR REPLACE FUNCTION public.process_sale_return(
  _sale_id uuid,
  _items jsonb,
  _reason text DEFAULT NULL,
  _supervisor_pin text DEFAULT NULL,
  _evidence_url text DEFAULT NULL,
  _refund_method text DEFAULT 'original'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.sales;
  _user_id uuid := auth.uid();
  _return_id uuid;
  _item jsonb;
  _sale_item public.sale_items;
  _qty numeric;
  _line_amount numeric;
  _return_total numeric := 0;
  _threshold numeric;
  _supervisor_id uuid;
  _refund_ratio numeric;
  _payment record;
  _refund_amount numeric;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
  IF NOT public.has_branch_role(_user_id, _sale.tenant_id, _sale.branch_id, ARRAY['owner','admin','manager','cashier']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Selecciona al menos un item para devolver';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _sale_item
    FROM public.sale_items
    WHERE id = (_item->>'sale_item_id')::uuid AND sale_id = _sale_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item de venta inválido'; END IF;
    _qty := COALESCE((_item->>'quantity')::numeric, _sale_item.quantity);
    IF _qty <= 0 OR _qty > _sale_item.quantity THEN
      RAISE EXCEPTION 'Cantidad de devolución inválida para %', _sale_item.product_name;
    END IF;
    _line_amount := round(_sale_item.line_total * (_qty / _sale_item.quantity), 2);
    _return_total := _return_total + _line_amount;
  END LOOP;

  SELECT return_supervisor_threshold INTO _threshold FROM public.tenants WHERE id = _sale.tenant_id;
  IF COALESCE(_threshold, 0) > 0 AND _return_total >= _threshold THEN
    SELECT ur.user_id INTO _supervisor_id
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.tenant_id = _sale.tenant_id
      AND ur.role IN ('owner','admin','manager')
      AND (ur.branch_id IS NULL OR ur.branch_id = _sale.branch_id)
      AND p.pin = _supervisor_pin
    LIMIT 1;
    IF _supervisor_id IS NULL THEN
      RAISE EXCEPTION 'PIN de supervisor requerido o inválido';
    END IF;
  END IF;

  INSERT INTO public.sale_returns (
    tenant_id, branch_id, original_sale_id, reason, amount, items,
    supervisor_user_id, evidence_url, refund_method, status, user_id
  )
  VALUES (
    _sale.tenant_id, _sale.branch_id, _sale_id, NULLIF(trim(COALESCE(_reason, '')), ''), _return_total, _items,
    _supervisor_id, _evidence_url, _refund_method, 'completed', _user_id
  )
  RETURNING id INTO _return_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _sale_item
    FROM public.sale_items
    WHERE id = (_item->>'sale_item_id')::uuid AND sale_id = _sale_id;
    _qty := COALESCE((_item->>'quantity')::numeric, _sale_item.quantity);
    IF _sale_item.product_id IS NOT NULL THEN
      PERFORM public.apply_inventory_movement(
        _sale.tenant_id, _sale.branch_id, _sale_item.product_id, 'return'::public.movement_type,
        _qty, 'Devolución ticket #' || _sale.ticket_number::text, 'sale_return', _return_id, _user_id, NULL
      );
    END IF;
  END LOOP;

  IF _sale.session_id IS NOT NULL AND _sale.total > 0 THEN
    _refund_ratio := LEAST(_return_total / _sale.total, 1);
    FOR _payment IN SELECT * FROM public.payments WHERE sale_id = _sale_id LOOP
      _refund_amount := round(_payment.amount * _refund_ratio, 2);
      UPDATE public.cash_sessions SET
        total_cash = total_cash - CASE WHEN _payment.method = 'cash' THEN _refund_amount ELSE 0 END,
        total_card = total_card - CASE WHEN _payment.method = 'card' THEN _refund_amount ELSE 0 END,
        total_transfer = total_transfer - CASE WHEN _payment.method = 'transfer' THEN _refund_amount ELSE 0 END,
        total_qr = total_qr - CASE WHEN _payment.method = 'qr' THEN _refund_amount ELSE 0 END
      WHERE id = _sale.session_id AND status = 'open';
    END LOOP;
  END IF;

  UPDATE public.sales
     SET status = CASE
       WHEN _return_total >= _sale.total - 0.01 THEN 'refunded'::public.sale_status
       ELSE 'partially_refunded'::public.sale_status
     END
   WHERE id = _sale_id;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, entity, entity_id, metadata)
  VALUES (
    _sale.tenant_id,
    _user_id,
    'sale.returned',
    'sale_returns',
    _return_id,
    jsonb_build_object('sale_id', _sale_id, 'amount', _return_total, 'supervisor_user_id', _supervisor_id, 'evidence_url', _evidence_url)
  );

  RETURN _return_id;
END;
$$;

-- =========================
-- Agente IA WhatsApp MVP: tablas y herramientas RPC auditadas
-- =========================

CREATE TABLE IF NOT EXISTS public.ai_channel_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  phone_number text,
  is_active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, branch_id, channel, phone_number)
);

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  external_conversation_id text NOT NULL,
  customer_name text,
  customer_phone text,
  status text NOT NULL DEFAULT 'open',
  handoff_reason text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel, external_conversation_id)
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','tool','system')),
  body text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_order_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  quote jsonb NOT NULL DEFAULT '{}'::jsonb,
  digital_order_id uuid REFERENCES public.digital_orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_channel_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_order_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_configs_admin_all" ON public.ai_channel_configs;
CREATE POLICY "ai_configs_admin_all" ON public.ai_channel_configs
FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]));

DROP POLICY IF EXISTS "ai_conversations_member_select" ON public.ai_conversations;
CREATE POLICY "ai_conversations_member_select" ON public.ai_conversations
FOR SELECT TO authenticated
USING (public.is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "ai_conversations_admin_all" ON public.ai_conversations;
CREATE POLICY "ai_conversations_admin_all" ON public.ai_conversations
FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager','cashier']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager','cashier']::public.app_role[]));

DROP POLICY IF EXISTS "ai_messages_member_select" ON public.ai_messages;
CREATE POLICY "ai_messages_member_select" ON public.ai_messages
FOR SELECT TO authenticated
USING (public.is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "ai_drafts_member_select" ON public.ai_order_drafts;
CREATE POLICY "ai_drafts_member_select" ON public.ai_order_drafts
FOR SELECT TO authenticated
USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE OR REPLACE FUNCTION public.ai_search_catalog(
  _tenant_id uuid,
  _branch_id uuid,
  _query text,
  _limit integer DEFAULT 8
)
RETURNS TABLE(product_id uuid, name text, price numeric, tax_rate numeric, sku text, barcode text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.price, p.tax_rate, p.sku, p.barcode
  FROM public.products p
  LEFT JOIN public.branch_products bp
    ON bp.product_id = p.id AND bp.branch_id = _branch_id
  WHERE p.tenant_id = _tenant_id
    AND p.status = 'active'
    AND p.product_type <> 'ingredient'
    AND COALESCE(bp.is_available, true) = true
    AND (
      _query IS NULL OR _query = ''
      OR p.name ILIKE '%' || _query || '%'
      OR p.sku ILIKE '%' || _query || '%'
      OR p.barcode ILIKE '%' || _query || '%'
    )
  ORDER BY p.name
  LIMIT LEAST(GREATEST(COALESCE(_limit, 8), 1), 20);
$$;

CREATE OR REPLACE FUNCTION public.ai_quote_order(
  _tenant_id uuid,
  _branch_id uuid,
  _items jsonb,
  _channel public.sales_channel DEFAULT 'whatsapp'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item jsonb;
  _product record;
  _subtotal numeric := 0;
  _tax numeric := 0;
  _line_sub numeric;
  _line_tax numeric;
  _lines jsonb := '[]'::jsonb;
BEGIN
  FOR _item IN SELECT * FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) LOOP
    SELECT id, name, price, tax_rate INTO _product
    FROM public.products
    WHERE id = (_item->>'product_id')::uuid AND tenant_id = _tenant_id AND status = 'active';
    IF FOUND THEN
      _line_sub := COALESCE((_item->>'quantity')::numeric, 1) * COALESCE((_item->>'unit_price')::numeric, _product.price);
      _line_tax := _line_sub * COALESCE(_product.tax_rate, 0) / 100.0;
      _subtotal := _subtotal + _line_sub;
      _tax := _tax + _line_tax;
      _lines := _lines || jsonb_build_array(jsonb_build_object(
        'product_id', _product.id,
        'name', _product.name,
        'quantity', COALESCE((_item->>'quantity')::numeric, 1),
        'unit_price', COALESCE((_item->>'unit_price')::numeric, _product.price),
        'line_total', _line_sub + _line_tax
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'channel', _channel,
    'subtotal', _subtotal,
    'tax_total', _tax,
    'total', _subtotal + _tax,
    'items', _lines
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_create_digital_order(
  _tenant_id uuid,
  _branch_id uuid,
  _conversation_id uuid,
  _items jsonb,
  _customer_name text DEFAULT NULL,
  _customer_phone text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order_id uuid;
  _draft_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.has_branch_role(auth.uid(), _tenant_id, _branch_id, ARRAY['owner','admin','manager','cashier']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  _order_id := public.register_digital_order(
    _tenant_id,
    _branch_id,
    'whatsapp'::public.sales_channel,
    'WA-' || replace(gen_random_uuid()::text, '-', ''),
    _items,
    0,
    concat_ws(' · ', _notes, _customer_name, _customer_phone)
  );

  INSERT INTO public.ai_order_drafts (tenant_id, branch_id, conversation_id, status, items, quote, digital_order_id)
  VALUES (_tenant_id, _branch_id, _conversation_id, 'created', _items, public.ai_quote_order(_tenant_id, _branch_id, _items, 'whatsapp'), _order_id)
  RETURNING id INTO _draft_id;

  RETURN _order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_handoff_to_human(_conversation_id uuid, _reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conversation public.ai_conversations;
BEGIN
  SELECT * INTO _conversation FROM public.ai_conversations WHERE id = _conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversación no encontrada'; END IF;
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.has_any_role(auth.uid(), _conversation.tenant_id, ARRAY['owner','admin','manager','cashier']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.ai_conversations
     SET status = 'handoff',
         handoff_reason = _reason,
         updated_at = now()
   WHERE id = _conversation_id;

  RETURN _conversation_id;
END;
$$;
