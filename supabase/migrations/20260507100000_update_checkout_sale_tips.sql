
-- =========================
-- update checkout_sale: add tip support and loyalty points
-- =========================

-- First, drop existing versions of the function to avoid ambiguity with different parameter sets
DROP FUNCTION IF EXISTS public.checkout_sale(uuid, uuid, jsonb, jsonb, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.checkout_sale(uuid, uuid, jsonb, jsonb, numeric, text, uuid, public.sales_channel);

CREATE OR REPLACE FUNCTION public.checkout_sale(
  _tenant_id uuid,
  _branch_id uuid,
  _items jsonb,
  _payments jsonb,
  _discount_total numeric DEFAULT 0,
  _notes text DEFAULT NULL,
  _customer_id uuid DEFAULT NULL,
  _channel public.sales_channel DEFAULT 'pos',
  _tip_amount numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _session_id UUID;
  _sale_id UUID;
  _subtotal NUMERIC := 0;
  _tax_total NUMERIC := 0;
  _total NUMERIC := 0;
  _item JSONB;
  _pay JSONB;
  _line_subtotal NUMERIC;
  _line_tax NUMERIC;
  _line_total NUMERIC;
  _product RECORD;
  _component RECORD;
  _points_config INTEGER;
  _points_earned INTEGER;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_tenant_member(_user_id, _tenant_id) THEN
    RAISE EXCEPTION 'Forbidden: not a tenant member';
  END IF;

  -- Caja abierta solo es obligatoria para canal POS
  IF _channel = 'pos' THEN
    SELECT id INTO _session_id FROM public.cash_sessions
     WHERE branch_id = _branch_id AND status = 'open'
     ORDER BY opened_at DESC LIMIT 1;
    IF _session_id IS NULL THEN
      RAISE EXCEPTION 'No hay caja abierta en esta sucursal. Abre caja antes de vender.';
    END IF;
  ELSE
    _session_id := NULL;
  END IF;

  -- Insert sale with tip_amount
  INSERT INTO public.sales (
    tenant_id, branch_id, session_id, user_id, customer_id, 
    subtotal, tax_total, discount_total, total, notes, 
    channel, tip_amount
  )
  VALUES (
    _tenant_id, _branch_id, _session_id, _user_id, _customer_id, 
    0, 0, _discount_total, 0, _notes, 
    _channel, COALESCE(_tip_amount, 0)
  )
  RETURNING id INTO _sale_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT id, name, product_type, tax_rate INTO _product
      FROM public.products
     WHERE id = (_item->>'product_id')::UUID AND tenant_id = _tenant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', _item->>'product_id'; END IF;

    _line_subtotal := (_item->>'quantity')::NUMERIC * (_item->>'unit_price')::NUMERIC
                    - COALESCE((_item->>'discount')::NUMERIC, 0);
    _line_tax := _line_subtotal * COALESCE((_item->>'tax_rate')::NUMERIC, _product.tax_rate, 0) / 100.0;
    _line_total := _line_subtotal + _line_tax;

    INSERT INTO public.sale_items
      (tenant_id, sale_id, product_id, product_name, product_type, quantity, unit_price, tax_rate, discount, line_total)
    VALUES
      (_tenant_id, _sale_id, _product.id, _product.name, _product.product_type,
       (_item->>'quantity')::NUMERIC, (_item->>'unit_price')::NUMERIC,
       COALESCE((_item->>'tax_rate')::NUMERIC, _product.tax_rate, 0),
       COALESCE((_item->>'discount')::NUMERIC, 0), _line_total);

    _subtotal := _subtotal + _line_subtotal;
    _tax_total := _tax_total + _line_tax;

    -- Inventario: descuenta independiente del canal
    IF _product.product_type IN ('simple','production','combo') THEN
      PERFORM public.apply_inventory_movement(
        _tenant_id, _branch_id, _product.id, 'sale',
        (_item->>'quantity')::NUMERIC, _channel || ' sale', 'sale', _sale_id, _user_id
      );
    ELSIF _product.product_type = 'composite' THEN
      FOR _component IN
        SELECT component_product_id, quantity, COALESCE(waste_pct,0) AS waste_pct
          FROM public.product_components
         WHERE parent_product_id = _product.id
      LOOP
        PERFORM public.apply_inventory_movement(
          _tenant_id, _branch_id, _component.component_product_id, 'consumption',
          _component.quantity * (_item->>'quantity')::NUMERIC * (1 + _component.waste_pct/100.0),
          'Composite ' || _channel, 'sale', _sale_id, _user_id
        );
      END LOOP;
    END IF;
  END LOOP;

  -- Total includes the tip
  _total := _subtotal + _tax_total - _discount_total + COALESCE(_tip_amount, 0);

  UPDATE public.sales SET subtotal = _subtotal, tax_total = _tax_total, total = _total
   WHERE id = _sale_id;

  -- Pagos: solo afectan caja si hay sesión (canal POS)
  FOR _pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    INSERT INTO public.payments (tenant_id, sale_id, method, amount, reference)
    VALUES (_tenant_id, _sale_id, (_pay->>'method')::payment_method,
            (_pay->>'amount')::NUMERIC, _pay->>'reference');

    IF _session_id IS NOT NULL THEN
      UPDATE public.cash_sessions SET
        total_cash = total_cash + CASE WHEN _pay->>'method' = 'cash' THEN (_pay->>'amount')::NUMERIC ELSE 0 END,
        total_card = total_card + CASE WHEN _pay->>'method' = 'card' THEN (_pay->>'amount')::NUMERIC ELSE 0 END,
        total_transfer = total_transfer + CASE WHEN _pay->>'method' = 'transfer' THEN (_pay->>'amount')::NUMERIC ELSE 0 END,
        total_qr = total_qr + CASE WHEN _pay->>'method' = 'qr' THEN (_pay->>'amount')::NUMERIC ELSE 0 END
      WHERE id = _session_id;
    END IF;
  END LOOP;

  -- Loyalty Points
  IF _customer_id IS NOT NULL THEN
    SELECT points_per_thousand INTO _points_config FROM public.tenants WHERE id = _tenant_id;
    _points_earned := floor(_total / 1000) * COALESCE(_points_config, 0);
    IF _points_earned > 0 THEN
      UPDATE public.customers SET loyalty_points = loyalty_points + _points_earned WHERE id = _customer_id;
    END IF;
  END IF;

  RETURN _sale_id;
END; $$;
