-- Start preparing a single item: pending -> preparing
CREATE OR REPLACE FUNCTION public.start_preparing_table_item(_item_id uuid)
RETURNS public.table_order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _it public.table_order_items;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _it FROM public.table_order_items WHERE id = _item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), _it.tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _it.status = 'cancelled' THEN RAISE EXCEPTION 'Item cancelado'; END IF;
  IF _it.status = 'preparing' OR _it.status = 'ready' OR _it.status = 'dispatched' THEN
    RETURN _it;
  END IF;

  UPDATE public.table_order_items
     SET status = 'preparing',
         started_at = COALESCE(started_at, now())
   WHERE id = _item_id
   RETURNING * INTO _it;
  RETURN _it;
END;
$$;

-- Mark item ready: preparing -> ready (also accepts pending for fast path)
CREATE OR REPLACE FUNCTION public.mark_table_item_ready(_item_id uuid)
RETURNS public.table_order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _it public.table_order_items;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _it FROM public.table_order_items WHERE id = _item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), _it.tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _it.status = 'cancelled' THEN RAISE EXCEPTION 'Item cancelado'; END IF;
  IF _it.status = 'ready' OR _it.status = 'dispatched' THEN
    RETURN _it;
  END IF;

  UPDATE public.table_order_items
     SET status = 'ready',
         started_at = COALESCE(started_at, now()),
         ready_at = COALESCE(ready_at, now())
   WHERE id = _item_id
   RETURNING * INTO _it;
  RETURN _it;
END;
$$;

-- Bulk: send order to kitchen (all pending items -> preparing)
CREATE OR REPLACE FUNCTION public.send_table_order_to_kitchen(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _o public.table_orders;
  _affected integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _o FROM public.table_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), _o.tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  UPDATE public.table_order_items
     SET status = 'preparing',
         started_at = COALESCE(started_at, now())
   WHERE order_id = _order_id AND status = 'pending';

  GET DIAGNOSTICS _affected = ROW_COUNT;
  RETURN _affected;
END;
$$;

-- Bulk: mark all preparing items as ready
CREATE OR REPLACE FUNCTION public.mark_table_order_ready(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _o public.table_orders;
  _affected integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _o FROM public.table_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), _o.tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  UPDATE public.table_order_items
     SET status = 'ready',
         ready_at = COALESCE(ready_at, now()),
         started_at = COALESCE(started_at, now())
   WHERE order_id = _order_id AND status IN ('pending', 'preparing');

  GET DIAGNOSTICS _affected = ROW_COUNT;
  RETURN _affected;
END;
$$;