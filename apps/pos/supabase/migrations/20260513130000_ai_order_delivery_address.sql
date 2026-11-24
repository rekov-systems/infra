-- Add delivery_address column to digital_orders for WhatsApp domicilio orders
ALTER TABLE public.digital_orders
  ADD COLUMN IF NOT EXISTS delivery_address text;

-- Update ai_create_digital_order to accept and store delivery address
DROP FUNCTION IF EXISTS public.ai_create_digital_order(uuid, uuid, uuid, jsonb, text, text, text);

CREATE OR REPLACE FUNCTION public.ai_create_digital_order(
  _tenant_id uuid,
  _branch_id uuid,
  _conversation_id uuid,
  _items jsonb,
  _customer_name text DEFAULT NULL,
  _customer_phone text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _delivery_address text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order_id uuid;
  _draft_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.has_branch_role(auth.uid(), _tenant_id, _branch_id, ARRAY['owner','admin','manager','cashier']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  _order_id := public.register_digital_order(
    _tenant_id,
    _branch_id,
    'whatsapp'::public.sales_channel,
    'WA-' || replace(gen_random_uuid()::text, '-', ''),
    _items,
    0,
    concat_ws(' · ', _notes, _customer_name, _customer_phone, _delivery_address)
  );

  -- Store delivery address in its own column
  UPDATE public.digital_orders
     SET delivery_address = _delivery_address
   WHERE id = _order_id;

  INSERT INTO public.ai_order_drafts (tenant_id, branch_id, conversation_id, status, items, quote, digital_order_id)
  VALUES (_tenant_id, _branch_id, _conversation_id, 'created', _items, public.ai_quote_order(_tenant_id, _branch_id, _items, 'whatsapp'), _order_id)
  RETURNING id INTO _draft_id;

  RETURN _order_id;
END;
$$;
