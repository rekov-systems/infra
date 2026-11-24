
-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.sales_channel AS ENUM ('pos','rappi','delivery');
CREATE TYPE public.delivery_status AS ENUM ('received','preparing','ready','assigned','on_way','delivered','cancelled');

-- =========================
-- ALTER sales: add channel
-- =========================
ALTER TABLE public.sales
  ADD COLUMN channel public.sales_channel NOT NULL DEFAULT 'pos';

-- session_id ya es nullable; reforzamos
ALTER TABLE public.sales ALTER COLUMN session_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_channel ON public.sales(channel);
CREATE INDEX IF NOT EXISTS idx_sales_branch_channel ON public.sales(branch_id, channel);

-- =========================
-- BRANCH PRODUCTS (catálogo por sucursal)
-- =========================
CREATE TABLE public.branch_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  product_id UUID NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  local_price NUMERIC NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, product_id)
);
CREATE INDEX idx_branch_products_branch ON public.branch_products(branch_id);
CREATE INDEX idx_branch_products_product ON public.branch_products(product_id);

ALTER TABLE public.branch_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_products_member_select" ON public.branch_products
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "branch_products_mgr_all" ON public.branch_products
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]));

CREATE TRIGGER trg_branch_products_updated
  BEFORE UPDATE ON public.branch_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- PRODUCT CHANNEL PRICES
-- =========================
CREATE TABLE public.product_channel_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  branch_id UUID NULL,                       -- null = aplica a todas las sucursales
  channel public.sales_channel NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- unicidad considerando NULL en branch_id
CREATE UNIQUE INDEX uniq_pcp_product_channel_global
  ON public.product_channel_prices(product_id, channel)
  WHERE branch_id IS NULL;
CREATE UNIQUE INDEX uniq_pcp_product_channel_branch
  ON public.product_channel_prices(product_id, channel, branch_id)
  WHERE branch_id IS NOT NULL;
CREATE INDEX idx_pcp_lookup ON public.product_channel_prices(product_id, channel, branch_id);

ALTER TABLE public.product_channel_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcp_member_select" ON public.product_channel_prices
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "pcp_mgr_all" ON public.product_channel_prices
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]));

CREATE TRIGGER trg_pcp_updated
  BEFORE UPDATE ON public.product_channel_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- DIGITAL ORDERS (Rappi & similares)
-- =========================
CREATE TABLE public.digital_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  channel public.sales_channel NOT NULL DEFAULT 'rappi',
  external_order_number TEXT,
  gross_total NUMERIC NOT NULL DEFAULT 0,
  platform_commission NUMERIC NOT NULL DEFAULT 0,
  net_total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received',
  notes TEXT,
  sale_id UUID,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_digital_orders_branch ON public.digital_orders(branch_id);
CREATE INDEX idx_digital_orders_status ON public.digital_orders(status);

ALTER TABLE public.digital_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "digital_orders_member_select" ON public.digital_orders
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "digital_orders_member_all" ON public.digital_orders
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER trg_digital_orders_updated
  BEFORE UPDATE ON public.digital_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- DELIVERY ORDERS (domicilio propio)
-- =========================
CREATE TABLE public.delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  customer_id UUID NULL,
  customer_name TEXT,
  customer_phone TEXT,
  address TEXT NOT NULL,
  neighborhood TEXT,
  courier_id UUID NULL,
  delivery_fee NUMERIC NOT NULL DEFAULT 0,
  status public.delivery_status NOT NULL DEFAULT 'received',
  notes TEXT,
  sale_id UUID,
  user_id UUID,
  assigned_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_delivery_orders_branch ON public.delivery_orders(branch_id);
CREATE INDEX idx_delivery_orders_status ON public.delivery_orders(status);
CREATE INDEX idx_delivery_orders_courier ON public.delivery_orders(courier_id);

ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_orders_member_select" ON public.delivery_orders
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "delivery_orders_member_all" ON public.delivery_orders
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER trg_delivery_orders_updated
  BEFORE UPDATE ON public.delivery_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- checkout_sale (actualizado para canal)
-- =========================
CREATE OR REPLACE FUNCTION public.checkout_sale(
  _tenant_id uuid,
  _branch_id uuid,
  _items jsonb,
  _payments jsonb,
  _discount_total numeric DEFAULT 0,
  _notes text DEFAULT NULL,
  _customer_id uuid DEFAULT NULL,
  _channel public.sales_channel DEFAULT 'pos'
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

  INSERT INTO public.sales (tenant_id, branch_id, session_id, user_id, customer_id, subtotal, tax_total, discount_total, total, notes, channel)
  VALUES (_tenant_id, _branch_id, _session_id, _user_id, _customer_id, 0, 0, _discount_total, 0, _notes, _channel)
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

  _total := _subtotal + _tax_total - _discount_total;

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

  RETURN _sale_id;
END; $$;

-- =========================
-- register_digital_order
-- =========================
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
  _user_id UUID := auth.uid();
  _sale_id UUID;
  _order_id UUID;
  _gross NUMERIC;
  _payments JSONB;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_tenant_member(_user_id, _tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _channel NOT IN ('rappi','delivery') THEN RAISE EXCEPTION 'Invalid channel for digital order'; END IF;

  -- Pago "platform" (registramos en otro flujo si hace falta). Por defecto sin pagos.
  _payments := '[]'::jsonb;

  _sale_id := public.checkout_sale(
    _tenant_id, _branch_id, _items, _payments, 0, _notes, NULL, _channel
  );

  SELECT total INTO _gross FROM public.sales WHERE id = _sale_id;

  INSERT INTO public.digital_orders
    (tenant_id, branch_id, channel, external_order_number, gross_total,
     platform_commission, net_total, status, notes, sale_id, user_id)
  VALUES
    (_tenant_id, _branch_id, _channel, _external_no, COALESCE(_gross,0),
     COALESCE(_commission,0), COALESCE(_gross,0) - COALESCE(_commission,0),
     'received', _notes, _sale_id, _user_id)
  RETURNING id INTO _order_id;

  RETURN _order_id;
END; $$;

-- =========================
-- register_delivery_order
-- =========================
CREATE OR REPLACE FUNCTION public.register_delivery_order(
  _tenant_id uuid,
  _branch_id uuid,
  _items jsonb,
  _customer_name text,
  _customer_phone text,
  _address text,
  _neighborhood text,
  _delivery_fee numeric DEFAULT 0,
  _customer_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _sale_id UUID;
  _order_id UUID;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_tenant_member(_user_id, _tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  _sale_id := public.checkout_sale(
    _tenant_id, _branch_id, _items, '[]'::jsonb, 0, _notes, _customer_id, 'delivery'
  );

  INSERT INTO public.delivery_orders
    (tenant_id, branch_id, customer_id, customer_name, customer_phone,
     address, neighborhood, delivery_fee, status, notes, sale_id, user_id)
  VALUES
    (_tenant_id, _branch_id, _customer_id, _customer_name, _customer_phone,
     _address, _neighborhood, COALESCE(_delivery_fee,0),
     'received', _notes, _sale_id, _user_id)
  RETURNING id INTO _order_id;

  RETURN _order_id;
END; $$;

-- =========================
-- update_delivery_status
-- =========================
CREATE OR REPLACE FUNCTION public.update_delivery_status(
  _order_id uuid,
  _status public.delivery_status,
  _courier_id uuid DEFAULT NULL
)
RETURNS public.delivery_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _o public.delivery_orders;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _o FROM public.delivery_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), _o.tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  UPDATE public.delivery_orders
     SET status = _status,
         courier_id = COALESCE(_courier_id, courier_id),
         assigned_at = CASE WHEN _status = 'assigned' AND assigned_at IS NULL THEN now() ELSE assigned_at END,
         delivered_at = CASE WHEN _status = 'delivered' THEN now() ELSE delivered_at END,
         updated_at = now()
   WHERE id = _order_id
   RETURNING * INTO _o;

  RETURN _o;
END; $$;
