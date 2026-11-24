
-- Estados
CREATE TYPE public.table_status AS ENUM ('available','occupied','reserved','inactive');
CREATE TYPE public.table_order_status AS ENUM ('open','sent_to_cashier','closed','cancelled');
CREATE TYPE public.table_item_status AS ENUM ('pending','dispatched','cancelled');

-- Catálogo de mesas
CREATE TABLE public.tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  name TEXT NOT NULL,
  capacity INT DEFAULT 4,
  sort_order INT DEFAULT 0,
  status public.table_status NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY tables_member_select ON public.tables FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY tables_mgr_all ON public.tables FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]));
CREATE TRIGGER trg_tables_updated BEFORE UPDATE ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Pedidos por mesa
CREATE TABLE public.table_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  table_id UUID NOT NULL,
  waiter_id UUID NOT NULL,
  status public.table_order_status NOT NULL DEFAULT 'open',
  guests INT DEFAULT 1,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_total NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  sale_id UUID,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.table_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY table_orders_member_select ON public.table_orders FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY table_orders_member_all ON public.table_orders FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_table_orders_updated BEFORE UPDATE ON public.table_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_table_orders_branch_status ON public.table_orders(branch_id, status);
CREATE INDEX idx_table_orders_table ON public.table_orders(table_id);

-- Items
CREATE TABLE public.table_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  product_type public.product_type NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  status public.table_item_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  dispatched_at TIMESTAMPTZ,
  dispatched_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.table_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY toi_member_select ON public.table_order_items FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY toi_member_all ON public.table_order_items FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_toi_updated BEFORE UPDATE ON public.table_order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_toi_order ON public.table_order_items(order_id);

-- Recalcular totales del pedido
CREATE OR REPLACE FUNCTION public.recalc_table_order(_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _sub NUMERIC := 0; _tax NUMERIC := 0;
BEGIN
  SELECT
    COALESCE(SUM(quantity * unit_price - discount), 0),
    COALESCE(SUM((quantity * unit_price - discount) * tax_rate / 100.0), 0)
  INTO _sub, _tax
  FROM public.table_order_items
  WHERE order_id = _order_id AND status <> 'cancelled';

  UPDATE public.table_orders
     SET subtotal = _sub, tax_total = _tax, total = _sub + _tax, updated_at = now()
   WHERE id = _order_id;
END; $$;

-- Despachar item: descuenta inventario y marca despachado
CREATE OR REPLACE FUNCTION public.dispatch_table_item(_item_id UUID)
RETURNS public.table_order_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _it public.table_order_items;
  _o  public.table_orders;
  _comp RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _it FROM public.table_order_items WHERE id = _item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), _it.tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _it.status = 'dispatched' THEN RETURN _it; END IF;
  IF _it.status = 'cancelled' THEN RAISE EXCEPTION 'Item cancelled'; END IF;

  SELECT * INTO _o FROM public.table_orders WHERE id = _it.order_id;

  IF _it.product_type IN ('simple','production','combo') THEN
    PERFORM public.apply_inventory_movement(
      _o.tenant_id, _o.branch_id, _it.product_id, 'sale',
      _it.quantity, 'Mesa dispatch', 'table_order', _o.id, auth.uid()
    );
  ELSIF _it.product_type = 'composite' THEN
    FOR _comp IN
      SELECT component_product_id, quantity, COALESCE(waste_pct,0) AS waste_pct
        FROM public.product_components WHERE parent_product_id = _it.product_id
    LOOP
      PERFORM public.apply_inventory_movement(
        _o.tenant_id, _o.branch_id, _comp.component_product_id, 'consumption',
        _comp.quantity * _it.quantity * (1 + _comp.waste_pct/100.0),
        'Mesa dispatch composite', 'table_order', _o.id, auth.uid()
      );
    END LOOP;
  END IF;

  UPDATE public.table_order_items
     SET status = 'dispatched', dispatched_at = now(), dispatched_by = auth.uid()
   WHERE id = _item_id
   RETURNING * INTO _it;
  RETURN _it;
END; $$;

-- Revertir despacho (devuelve stock)
CREATE OR REPLACE FUNCTION public.undispatch_table_item(_item_id UUID)
RETURNS public.table_order_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _it public.table_order_items;
  _o  public.table_orders;
  _comp RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _it FROM public.table_order_items WHERE id = _item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), _it.tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _it.status <> 'dispatched' THEN RETURN _it; END IF;

  SELECT * INTO _o FROM public.table_orders WHERE id = _it.order_id;

  IF _it.product_type IN ('simple','production','combo') THEN
    PERFORM public.apply_inventory_movement(
      _o.tenant_id, _o.branch_id, _it.product_id, 'return',
      _it.quantity, 'Mesa undispatch', 'table_order', _o.id, auth.uid()
    );
  ELSIF _it.product_type = 'composite' THEN
    FOR _comp IN
      SELECT component_product_id, quantity, COALESCE(waste_pct,0) AS waste_pct
        FROM public.product_components WHERE parent_product_id = _it.product_id
    LOOP
      PERFORM public.apply_inventory_movement(
        _o.tenant_id, _o.branch_id, _comp.component_product_id, 'return',
        _comp.quantity * _it.quantity * (1 + _comp.waste_pct/100.0),
        'Mesa undispatch composite', 'table_order', _o.id, auth.uid()
      );
    END LOOP;
  END IF;

  UPDATE public.table_order_items
     SET status = 'pending', dispatched_at = NULL, dispatched_by = NULL
   WHERE id = _item_id
   RETURNING * INTO _it;
  RETURN _it;
END; $$;

-- Enviar a caja
CREATE OR REPLACE FUNCTION public.send_table_order_to_cashier(_order_id UUID)
RETURNS public.table_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _o public.table_orders;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _o FROM public.table_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), _o.tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _o.status <> 'open' THEN RAISE EXCEPTION 'Order is not open'; END IF;

  PERFORM public.recalc_table_order(_order_id);
  UPDATE public.table_orders
     SET status = 'sent_to_cashier', sent_at = now()
   WHERE id = _order_id RETURNING * INTO _o;
  RETURN _o;
END; $$;

-- Cobrar pedido (cajero). No re-descuenta inventario (ya se descontó al despachar).
-- Items pendientes se cancelan automáticamente.
CREATE OR REPLACE FUNCTION public.checkout_table_order(_order_id UUID, _payments JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _o public.table_orders;
  _user_id UUID := auth.uid();
  _session_id UUID;
  _sale_id UUID;
  _it RECORD;
  _pay JSONB;
  _sub NUMERIC := 0; _tax NUMERIC := 0;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _o FROM public.table_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.is_tenant_member(_user_id, _o.tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _o.status NOT IN ('open','sent_to_cashier') THEN RAISE EXCEPTION 'Order not payable'; END IF;

  SELECT id INTO _session_id FROM public.cash_sessions
   WHERE branch_id = _o.branch_id AND status = 'open'
   ORDER BY opened_at DESC LIMIT 1;
  IF _session_id IS NULL THEN
    RAISE EXCEPTION 'No hay caja abierta en esta sucursal.';
  END IF;

  -- Cancela pendientes (no se cobran ni se descuentan)
  UPDATE public.table_order_items SET status = 'cancelled'
   WHERE order_id = _order_id AND status = 'pending';

  PERFORM public.recalc_table_order(_order_id);
  SELECT subtotal, tax_total INTO _sub, _tax FROM public.table_orders WHERE id = _order_id;

  INSERT INTO public.sales (tenant_id, branch_id, session_id, user_id, subtotal, tax_total, discount_total, total, notes, channel)
  VALUES (_o.tenant_id, _o.branch_id, _session_id, _user_id, _sub, _tax, 0, _sub + _tax,
          COALESCE(_o.notes,'') || ' [Mesa]', 'pos')
  RETURNING id INTO _sale_id;

  -- Crear sale_items desde los items despachados
  FOR _it IN SELECT * FROM public.table_order_items WHERE order_id = _order_id AND status = 'dispatched' LOOP
    INSERT INTO public.sale_items
      (tenant_id, sale_id, product_id, product_name, product_type, quantity, unit_price, tax_rate, discount, line_total)
    VALUES
      (_o.tenant_id, _sale_id, _it.product_id, _it.product_name, _it.product_type,
       _it.quantity, _it.unit_price, _it.tax_rate, _it.discount, _it.line_total);
  END LOOP;

  -- Pagos y caja
  FOR _pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    INSERT INTO public.payments (tenant_id, sale_id, method, amount, reference)
    VALUES (_o.tenant_id, _sale_id, (_pay->>'method')::payment_method,
            (_pay->>'amount')::NUMERIC, _pay->>'reference');
    UPDATE public.cash_sessions SET
      total_cash = total_cash + CASE WHEN _pay->>'method' = 'cash' THEN (_pay->>'amount')::NUMERIC ELSE 0 END,
      total_card = total_card + CASE WHEN _pay->>'method' = 'card' THEN (_pay->>'amount')::NUMERIC ELSE 0 END,
      total_transfer = total_transfer + CASE WHEN _pay->>'method' = 'transfer' THEN (_pay->>'amount')::NUMERIC ELSE 0 END,
      total_qr = total_qr + CASE WHEN _pay->>'method' = 'qr' THEN (_pay->>'amount')::NUMERIC ELSE 0 END
    WHERE id = _session_id;
  END LOOP;

  UPDATE public.table_orders
     SET status = 'closed', closed_at = now(), sale_id = _sale_id
   WHERE id = _order_id;

  -- Liberar la mesa
  UPDATE public.tables SET status = 'available'
   WHERE id = _o.table_id;

  RETURN _sale_id;
END; $$;
