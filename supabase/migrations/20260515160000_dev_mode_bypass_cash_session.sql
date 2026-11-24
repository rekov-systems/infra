-- Dev mode: bypass the "open cash session" requirement in checkout_sale and
-- auto-dispatch non-cancelled items in checkout_table_order so that a test
-- tenant can complete the full sale/table flow without opening a cash session
-- or following the kitchen dispatch workflow.

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
  _dev_mode boolean;
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

  -- Check dev_mode once; bypass cash-session requirement when enabled
  SELECT dev_mode INTO _dev_mode FROM public.tenants WHERE id = _tenant_id;

  IF _channel IN ('pos','tables') THEN
    SELECT id INTO _session_id
    FROM public.cash_sessions
    WHERE branch_id = _branch_id AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;
    IF _session_id IS NULL AND NOT COALESCE(_dev_mode, false) THEN
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

    -- Only update cash session totals when there is an open session
    IF _session_id IS NOT NULL THEN
      UPDATE public.cash_sessions SET
        total_cash     = total_cash     + CASE WHEN _pay->>'method' = 'cash'     THEN (_pay->>'amount')::numeric ELSE 0 END,
        total_card     = total_card     + CASE WHEN _pay->>'method' = 'card'     THEN (_pay->>'amount')::numeric ELSE 0 END,
        total_transfer = total_transfer + CASE WHEN _pay->>'method' = 'transfer' THEN (_pay->>'amount')::numeric ELSE 0 END,
        total_qr       = total_qr       + CASE WHEN _pay->>'method' = 'qr'       THEN (_pay->>'amount')::numeric ELSE 0 END
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

-- In dev mode, auto-dispatch all non-cancelled items before collecting the sale
-- so the cashier can close a table without going through the full kitchen flow.

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
  _dev_mode boolean;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _o FROM public.table_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_branch_role(_user_id, _o.tenant_id, _o.branch_id, ARRAY['owner','admin','manager','cashier','waiter']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _o.status NOT IN ('open','sent_to_cashier') THEN RAISE EXCEPTION 'Order not payable'; END IF;

  SELECT dev_mode INTO _dev_mode FROM public.tenants WHERE id = _o.tenant_id;

  IF COALESCE(_dev_mode, false) THEN
    -- Dev mode: promote all active items straight to dispatched so the sale includes them
    UPDATE public.table_order_items
       SET status = 'dispatched'
     WHERE order_id = _order_id AND status IN ('pending', 'preparing', 'ready');
  ELSE
    -- Normal mode: pending items (not yet sent to kitchen) are void at checkout time
    UPDATE public.table_order_items
       SET status = 'cancelled'
     WHERE order_id = _order_id AND status = 'pending';
  END IF;

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
