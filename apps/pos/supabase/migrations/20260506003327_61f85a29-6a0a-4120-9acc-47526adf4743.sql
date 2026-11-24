-- 1) Pre-asignación de mesa a un mesero (opcional, mixto)
ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS assigned_waiter_id uuid;

CREATE INDEX IF NOT EXISTS idx_tables_assigned_waiter ON public.tables(assigned_waiter_id);

-- 2) RPC: registrar pago de domicilio (efectivo / datafono) por el courier
CREATE OR REPLACE FUNCTION public.register_delivery_payment(
  _order_id uuid,
  _method payment_method,
  _amount numeric,
  _reference text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _o public.delivery_orders;
  _session_id uuid;
  _payment_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _o FROM public.delivery_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), _o.tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _o.sale_id IS NULL THEN RAISE EXCEPTION 'Pedido sin venta asociada'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;

  INSERT INTO public.payments (tenant_id, sale_id, method, amount, reference)
  VALUES (_o.tenant_id, _o.sale_id, _method, _amount, _reference)
  RETURNING id INTO _payment_id;

  -- Si hay caja abierta, refleja el pago ahí
  SELECT id INTO _session_id FROM public.cash_sessions
   WHERE branch_id = _o.branch_id AND status = 'open'
   ORDER BY opened_at DESC LIMIT 1;

  IF _session_id IS NOT NULL THEN
    UPDATE public.cash_sessions SET
      total_cash = total_cash + CASE WHEN _method = 'cash' THEN _amount ELSE 0 END,
      total_card = total_card + CASE WHEN _method = 'card' THEN _amount ELSE 0 END,
      total_transfer = total_transfer + CASE WHEN _method = 'transfer' THEN _amount ELSE 0 END,
      total_qr = total_qr + CASE WHEN _method = 'qr' THEN _amount ELSE 0 END
    WHERE id = _session_id;
  END IF;

  -- Asociar la venta a la sesión y marcar venta como pagada
  UPDATE public.sales
     SET session_id = COALESCE(session_id, _session_id),
         updated_at = now()
   WHERE id = _o.sale_id;

  RETURN _payment_id;
END;
$$;