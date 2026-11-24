-- When dev_mode is enabled on the tenant, bypass the negative-stock guard
-- so sales can be registered regardless of available inventory.

CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  _tenant_id uuid,
  _branch_id uuid,
  _product_id uuid,
  _movement_type public.movement_type,
  _quantity numeric,
  _reason text,
  _reference_type text,
  _reference_id uuid,
  _user_id uuid,
  _inventory_center_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _signed numeric;
  _movement_id uuid;
  _target_center_id uuid := _inventory_center_id;
  _new_quantity numeric;
  _allow_negative boolean;
  _dev_mode boolean;
BEGIN
  IF COALESCE(_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.has_branch_role(COALESCE(auth.uid(), _user_id), _tenant_id, _branch_id, ARRAY['owner','admin','manager','inventory','cashier','kitchen']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _target_center_id IS NULL THEN
    SELECT id INTO _target_center_id
    FROM public.inventory_centers
    WHERE branch_id = _branch_id AND status = 'active'
    ORDER BY (name = 'Bodega Principal') DESC, created_at ASC
    LIMIT 1;
  END IF;
  IF _target_center_id IS NULL THEN
    RAISE EXCEPTION 'No inventory center found for branch %', _branch_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_centers
    WHERE id = _target_center_id AND tenant_id = _tenant_id AND branch_id = _branch_id
  ) THEN
    RAISE EXCEPTION 'Centro de inventario inválido';
  END IF;

  _signed := CASE _movement_type
    WHEN 'purchase'    THEN  _quantity
    WHEN 'production'  THEN  _quantity
    WHEN 'return'      THEN  _quantity
    WHEN 'adjustment'  THEN  _quantity
    WHEN 'sale'        THEN -_quantity
    WHEN 'waste'       THEN -_quantity
    WHEN 'consumption' THEN -_quantity
    WHEN 'transfer'    THEN -_quantity
  END;

  SELECT allow_negative_stock, dev_mode
    INTO _allow_negative, _dev_mode
    FROM public.tenants
   WHERE id = _tenant_id;

  INSERT INTO public.inventory_stocks (tenant_id, branch_id, inventory_center_id, product_id, quantity)
  VALUES (_tenant_id, _branch_id, _target_center_id, _product_id, _signed)
  ON CONFLICT (inventory_center_id, product_id) DO UPDATE
    SET quantity   = public.inventory_stocks.quantity + EXCLUDED.quantity,
        updated_at = now()
  RETURNING quantity INTO _new_quantity;

  -- Block negative stock only when NEITHER allow_negative_stock NOR dev_mode is enabled
  IF NOT COALESCE(_allow_negative, false)
     AND NOT COALESCE(_dev_mode, false)
     AND _new_quantity < 0
  THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto %', _product_id;
  END IF;

  INSERT INTO public.inventory_movements
    (tenant_id, branch_id, inventory_center_id, product_id, movement_type, quantity, reason, reference_type, reference_id, user_id)
  VALUES
    (_tenant_id, _branch_id, _target_center_id, _product_id, _movement_type, _quantity, _reason, _reference_type, _reference_id, _user_id)
  RETURNING id INTO _movement_id;

  RETURN _movement_id;
END;
$$;
