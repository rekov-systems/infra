-- Mark when an order was first dispatched to the kitchen so the UI can
-- distinguish "open · sin enviar" from "open · en cocina" without losing
-- the order while items move from pending → preparing → ready.

ALTER TABLE public.table_orders
  ADD COLUMN IF NOT EXISTS kitchen_sent_at TIMESTAMPTZ;

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

  UPDATE public.table_orders
     SET kitchen_sent_at = COALESCE(kitchen_sent_at, now()),
         updated_at = now()
   WHERE id = _order_id;

  RETURN _affected;
END;
$$;
