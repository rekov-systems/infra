-- Feature: requires_detail on products + table occupancy enforcement + per-item notes in QR orders

-- 1. Add requires_detail column to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS requires_detail boolean DEFAULT false;

-- 2. Update get_branch_menu to expose requires_detail
CREATE OR REPLACE FUNCTION public.get_branch_menu(_branch_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH branch_row AS (
    SELECT
      b.id, b.tenant_id, b.name,
      t.name          AS tenant_name,
      t.logo_url      AS tenant_logo,
      t.primary_color AS tenant_color
    FROM public.branches b
    JOIN public.tenants t ON t.id = b.tenant_id
    WHERE b.id = _branch_id
      AND b.status = 'active'
  ),
  branch_stock AS (
    SELECT product_id, COALESCE(SUM(quantity), 0) AS total_stock
    FROM public.inventory_stocks
    WHERE branch_id = _branch_id
    GROUP BY product_id
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM branch_row) THEN NULL
    ELSE jsonb_build_object(
      'branch', (
        SELECT jsonb_build_object(
          'id',           id,
          'name',         name,
          'tenant_id',    tenant_id,
          'tenant_name',  tenant_name,
          'tenant_logo',  tenant_logo,
          'tenant_color', tenant_color
        )
        FROM branch_row
      ),
      'categories', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',               c.id,
            'name',             c.name,
            'color',            c.color,
            'schedule_enabled', c.schedule_enabled,
            'schedule_from',    c.schedule_from,
            'schedule_until',   c.schedule_until,
            'schedule_days',    c.schedule_days,
            'products', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id',             p.id,
                  'name',           p.name,
                  'description',    p.description,
                  'price',          COALESCE(bp.local_price, p.price),
                  'tax_rate',       p.tax_rate,
                  'image_url',      p.image_url,
                  'sort_order',     p.sort_order,
                  'stock',          bs.total_stock,
                  'has_stock_record', (bs.product_id IS NOT NULL),
                  'requires_detail', p.requires_detail
                )
                ORDER BY p.sort_order, p.name
              )
              FROM public.products p
              LEFT JOIN public.branch_products bp
                ON bp.product_id = p.id AND bp.branch_id = _branch_id
              LEFT JOIN branch_stock bs
                ON bs.product_id = p.id
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

-- 3. Update create_qr_order:
--    - Block when table has a sent_to_cashier order (pending payment)
--    - Support per-item notes field
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

    -- Block if table has a pending-payment order
    IF EXISTS (
      SELECT 1 FROM public.table_orders
      WHERE table_id = _table_id AND status = 'sent_to_cashier'
    ) THEN
      RAISE EXCEPTION 'Mesa con pedido pendiente de pago';
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
        (tenant_id, order_id, product_id, product_name, product_type, quantity, unit_price, tax_rate, discount, line_total, modifiers, status, notes)
      VALUES
        (_tenant_id, _order_id, _product.id, _product.name, _product.product_type,
         (_item->>'quantity')::numeric, _product.final_price, COALESCE(_product.tax_rate, 0),
         0, _line_total, COALESCE(_item->'modifiers', '[]'::jsonb), 'pending',
         NULLIF(trim(COALESCE(_item->>'notes', '')), ''));
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
