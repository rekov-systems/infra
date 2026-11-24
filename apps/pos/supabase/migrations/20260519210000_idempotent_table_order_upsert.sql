-- Idempotent helper for the "send-cart-to-table" offline flow.
-- The previous TypeScript helper (`upsertTableOrderItems`) did SELECT + INSERT
-- across two tables outside a transaction; a network retry from the sync
-- engine could duplicate either the order or the items. This RPC uses
-- `operation_log` (UNIQUE on `tenant_id, client_mutation_id`) as the gate:
-- the first attempt inserts the log row and does the work; any retry sees
-- the existing row and returns the previously-created order id.

CREATE OR REPLACE FUNCTION public.upsert_table_order_items(
  _tenant_id uuid,
  _branch_id uuid,
  _table_id uuid,
  _waiter_id uuid,
  _items jsonb,
  _client_mutation_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _order_id uuid;
  _existing_order_id uuid;
  _existing_entity uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_tenant_member(_user_id, _tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'La comanda no tiene items';
  END IF;

  -- Idempotency gate: if this mutation already ran, return the prior result.
  IF _client_mutation_id IS NOT NULL THEN
    SELECT entity_id INTO _existing_entity
    FROM public.operation_log
    WHERE tenant_id = _tenant_id AND client_mutation_id = _client_mutation_id;
    IF _existing_entity IS NOT NULL THEN
      RETURN _existing_entity;
    END IF;
  END IF;

  -- Find or create the open order for the table.
  SELECT id INTO _existing_order_id
  FROM public.table_orders
  WHERE table_id = _table_id AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF _existing_order_id IS NULL THEN
    INSERT INTO public.table_orders
      (tenant_id, branch_id, table_id, waiter_id, status, subtotal, tax_total, total, opened_at)
    VALUES
      (_tenant_id, _branch_id, _table_id, _waiter_id, 'open', 0, 0, 0, now())
    RETURNING id INTO _order_id;
  ELSE
    _order_id := _existing_order_id;
  END IF;

  -- Insert items.
  INSERT INTO public.table_order_items (
    tenant_id, order_id, product_id, product_name, product_type,
    quantity, unit_price, tax_rate, discount, line_total, modifiers, status, notes
  )
  SELECT
    _tenant_id,
    _order_id,
    (i->>'product_id')::uuid,
    i->>'product_name',
    COALESCE(i->>'product_type', 'simple'),
    (i->>'quantity')::numeric,
    (i->>'unit_price')::numeric,
    COALESCE((i->>'tax_rate')::numeric, 0),
    COALESCE((i->>'discount')::numeric, 0),
    (i->>'line_total')::numeric,
    COALESCE(i->'modifiers', '[]'::jsonb),
    'pending',
    NULLIF(i->>'notes', '')
  FROM jsonb_array_elements(_items) AS i;

  PERFORM public.recalc_table_order(_order_id);

  -- Record the mutation so future retries are idempotent.
  IF _client_mutation_id IS NOT NULL THEN
    INSERT INTO public.operation_log
      (tenant_id, branch_id, operation_type, client_mutation_id, status, entity_type, entity_id, payload)
    VALUES
      (_tenant_id, _branch_id, 'upsert_table_order_items', _client_mutation_id,
       'applied', 'table_orders', _order_id, jsonb_build_object('table_id', _table_id, 'items_count', jsonb_array_length(_items)))
    ON CONFLICT (tenant_id, client_mutation_id) DO NOTHING;
  END IF;

  RETURN _order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_table_order_items(uuid, uuid, uuid, uuid, jsonb, text) TO authenticated;

-- Idempotent variant of create_qr_order. We keep the original signature for
-- backwards compatibility and add an overload that accepts a client mutation
-- id, so the QR menu can deduplicate retries from the same browser.
CREATE OR REPLACE FUNCTION public.create_qr_order(
  _branch_id uuid,
  _items jsonb,
  _table_id uuid,
  _customer_name text,
  _notes text,
  _client_mutation_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
  _existing_entity uuid;
  _order_id uuid;
BEGIN
  SELECT tenant_id INTO _tenant_id
  FROM public.branches
  WHERE id = _branch_id AND status = 'active';
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Sucursal no disponible';
  END IF;

  IF _client_mutation_id IS NOT NULL THEN
    SELECT entity_id INTO _existing_entity
    FROM public.operation_log
    WHERE tenant_id = _tenant_id AND client_mutation_id = _client_mutation_id;
    IF _existing_entity IS NOT NULL THEN
      RETURN _existing_entity;
    END IF;
  END IF;

  _order_id := public.create_qr_order(_branch_id, _items, _table_id, _customer_name, _notes);

  IF _client_mutation_id IS NOT NULL AND _order_id IS NOT NULL THEN
    INSERT INTO public.operation_log
      (tenant_id, branch_id, operation_type, client_mutation_id, status, entity_type, entity_id, payload)
    VALUES
      (_tenant_id, _branch_id, 'create_qr_order', _client_mutation_id,
       'applied', 'table_orders', _order_id, jsonb_build_object('items_count', jsonb_array_length(COALESCE(_items, '[]'::jsonb))))
    ON CONFLICT (tenant_id, client_mutation_id) DO NOTHING;
  END IF;

  RETURN _order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_qr_order(uuid, jsonb, uuid, text, text, text) TO anon, authenticated;
