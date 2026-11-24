
-- 1) checkout_sale: exigir caja abierta
CREATE OR REPLACE FUNCTION public.checkout_sale(_tenant_id uuid, _branch_id uuid, _items jsonb, _payments jsonb, _discount_total numeric DEFAULT 0, _notes text DEFAULT NULL::text, _customer_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_tenant_member(_user_id, _tenant_id) THEN
    RAISE EXCEPTION 'Forbidden: not a tenant member';
  END IF;

  -- Find open cash session for this branch (REQUIRED)
  SELECT id INTO _session_id FROM public.cash_sessions
   WHERE branch_id = _branch_id AND status = 'open'
   ORDER BY opened_at DESC LIMIT 1;

  IF _session_id IS NULL THEN
    RAISE EXCEPTION 'No hay caja abierta en esta sucursal. Abre caja antes de vender.';
  END IF;

  -- Create sale
  INSERT INTO public.sales (tenant_id, branch_id, session_id, user_id, customer_id, subtotal, tax_total, discount_total, total, notes)
  VALUES (_tenant_id, _branch_id, _session_id, _user_id, _customer_id, 0, 0, _discount_total, 0, _notes)
  RETURNING id INTO _sale_id;

  -- Items loop
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

    -- Inventory deduction by product type
    IF _product.product_type IN ('simple','production','combo') THEN
      PERFORM public.apply_inventory_movement(
        _tenant_id, _branch_id, _product.id, 'sale',
        (_item->>'quantity')::NUMERIC, 'POS sale', 'sale', _sale_id, _user_id
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
          'Composite sale', 'sale', _sale_id, _user_id
        );
      END LOOP;
    END IF;
  END LOOP;

  _total := _subtotal + _tax_total - _discount_total;

  UPDATE public.sales SET subtotal = _subtotal, tax_total = _tax_total, total = _total
   WHERE id = _sale_id;

  -- Payments + cash session totals
  FOR _pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    INSERT INTO public.payments (tenant_id, sale_id, method, amount, reference)
    VALUES (_tenant_id, _sale_id, (_pay->>'method')::payment_method,
            (_pay->>'amount')::NUMERIC, _pay->>'reference');

    UPDATE public.cash_sessions SET
      total_cash = total_cash + CASE WHEN _pay->>'method' = 'cash' THEN (_pay->>'amount')::NUMERIC ELSE 0 END,
      total_card = total_card + CASE WHEN _pay->>'method' = 'card' THEN (_pay->>'amount')::NUMERIC ELSE 0 END,
      total_transfer = total_transfer + CASE WHEN _pay->>'method' = 'transfer' THEN (_pay->>'amount')::NUMERIC ELSE 0 END,
      total_qr = total_qr + CASE WHEN _pay->>'method' = 'qr' THEN (_pay->>'amount')::NUMERIC ELSE 0 END
    WHERE id = _session_id;
  END LOOP;

  RETURN _sale_id;
END; $function$;


-- 2) add_cash_movement: ingresos / egresos manuales en sesión abierta
CREATE OR REPLACE FUNCTION public.add_cash_movement(
  _session_id uuid,
  _type text,
  _amount numeric,
  _reason text DEFAULT NULL
)
RETURNS public.cash_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _s public.cash_sessions;
  _mv public.cash_movements;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _type NOT IN ('in','out') THEN RAISE EXCEPTION 'Invalid type, expected in|out'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

  SELECT * INTO _s FROM public.cash_sessions WHERE id = _session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), _s.tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _s.status <> 'open' THEN RAISE EXCEPTION 'Session is not open'; END IF;

  INSERT INTO public.cash_movements (tenant_id, session_id, type, amount, reason, user_id)
  VALUES (_s.tenant_id, _s.id, _type, _amount, _reason, auth.uid())
  RETURNING * INTO _mv;

  IF _type = 'in' THEN
    UPDATE public.cash_sessions SET total_in = total_in + _amount WHERE id = _s.id;
  ELSE
    UPDATE public.cash_sessions SET total_out = total_out + _amount WHERE id = _s.id;
  END IF;

  RETURN _mv;
END; $$;


-- 3) complete_production_order: descuenta ingredientes y suma producto terminado
CREATE OR REPLACE FUNCTION public.complete_production_order(
  _order_id uuid,
  _produced numeric,
  _waste numeric DEFAULT 0
)
RETURNS public.production_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _o public.production_orders;
  _comp RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _o FROM public.production_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_any_role(auth.uid(), _o.tenant_id, ARRAY['owner','admin','manager','kitchen']::app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _o.status = 'completed' THEN RAISE EXCEPTION 'Order already completed'; END IF;
  IF _produced IS NULL OR _produced < 0 THEN RAISE EXCEPTION 'Produced quantity invalid'; END IF;

  -- Consume ingredients per recipe
  FOR _comp IN
    SELECT component_product_id, quantity, COALESCE(waste_pct,0) AS waste_pct
      FROM public.product_components
     WHERE parent_product_id = _o.product_id
  LOOP
    PERFORM public.apply_inventory_movement(
      _o.tenant_id, _o.branch_id, _comp.component_product_id, 'consumption',
      _comp.quantity * _produced * (1 + _comp.waste_pct/100.0),
      'Production order', 'production_order', _o.id, auth.uid()
    );
    INSERT INTO public.production_consumptions (tenant_id, order_id, product_id, quantity)
    VALUES (_o.tenant_id, _o.id, _comp.component_product_id, _comp.quantity * _produced * (1 + _comp.waste_pct/100.0));
  END LOOP;

  -- Add finished product to stock
  IF _produced > 0 THEN
    PERFORM public.apply_inventory_movement(
      _o.tenant_id, _o.branch_id, _o.product_id, 'production',
      _produced, 'Production output', 'production_order', _o.id, auth.uid()
    );
  END IF;

  UPDATE public.production_orders
     SET status = 'completed',
         produced_quantity = _produced,
         waste_quantity = COALESCE(_waste, 0),
         completed_at = now(),
         user_id = auth.uid()
   WHERE id = _o.id
   RETURNING * INTO _o;

  RETURN _o;
END; $$;
