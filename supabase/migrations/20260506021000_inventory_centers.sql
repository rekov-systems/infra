
-- Create inventory_centers table
CREATE TABLE public.inventory_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'warehouse', -- 'warehouse', 'point_of_sale', 'bar', etc.
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory_centers ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies
CREATE POLICY "centers_member_select" ON public.inventory_centers FOR SELECT TO authenticated 
USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "centers_admin_all" ON public.inventory_centers FOR ALL TO authenticated 
USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]));

-- Modify inventory_stocks
ALTER TABLE public.inventory_stocks ADD COLUMN inventory_center_id UUID REFERENCES public.inventory_centers(id) ON DELETE CASCADE;

-- Modify inventory_movements
ALTER TABLE public.inventory_movements ADD COLUMN inventory_center_id UUID REFERENCES public.inventory_centers(id) ON DELETE CASCADE;

-- Initial data migration: Create a default center for each branch
DO $$
DECLARE
    _branch RECORD;
    _center_id UUID;
BEGIN
    FOR _branch IN SELECT id, tenant_id FROM public.branches LOOP
        INSERT INTO public.inventory_centers (tenant_id, branch_id, name, type)
        VALUES (_branch.tenant_id, _branch.id, 'Bodega Principal', 'warehouse')
        RETURNING id INTO _center_id;

        -- Update existing stocks for this branch
        UPDATE public.inventory_stocks 
        SET inventory_center_id = _center_id
        WHERE branch_id = _branch.id;

        -- Update existing movements for this branch
        UPDATE public.inventory_movements
        SET inventory_center_id = _center_id
        WHERE branch_id = _branch.id;
    END LOOP;
END $$;

-- Set inventory_center_id as NOT NULL after migration
ALTER TABLE public.inventory_stocks ALTER COLUMN inventory_center_id SET NOT NULL;
ALTER TABLE public.inventory_movements ALTER COLUMN inventory_center_id SET NOT NULL;

-- Update Unique Constraint on inventory_stocks
-- First, find the name of the existing unique constraint
DO $$
DECLARE
    _constraint_name TEXT;
BEGIN
    SELECT conname INTO _constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.inventory_stocks'::regclass AND contype = 'u';

    IF _constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.inventory_stocks DROP CONSTRAINT ' || _constraint_name;
    END IF;
END $$;

ALTER TABLE public.inventory_stocks ADD CONSTRAINT inventory_stocks_center_product_key UNIQUE (inventory_center_id, product_id);

-- Update apply_inventory_movement RPC
CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  _tenant_id UUID, _branch_id UUID, _product_id UUID,
  _movement_type public.movement_type, _quantity NUMERIC, _reason TEXT,
  _reference_type TEXT, _reference_id UUID, _user_id UUID,
  _inventory_center_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _signed NUMERIC;
  _movement_id UUID;
  _target_center_id UUID := _inventory_center_id;
BEGIN
  -- If center not provided, try to find the "Bodega Principal" or the first active center for the branch
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

  -- Negative for outflows, positive for inflows
  _signed := CASE _movement_type
    WHEN 'purchase' THEN _quantity
    WHEN 'production' THEN _quantity
    WHEN 'return' THEN _quantity
    WHEN 'adjustment' THEN _quantity   -- caller decides sign
    WHEN 'sale' THEN -_quantity
    WHEN 'waste' THEN -_quantity
    WHEN 'consumption' THEN -_quantity
    WHEN 'transfer' THEN -_quantity
  END;

  INSERT INTO public.inventory_stocks (tenant_id, branch_id, inventory_center_id, product_id, quantity)
  VALUES (_tenant_id, _branch_id, _target_center_id, _product_id, _signed)
  ON CONFLICT (inventory_center_id, product_id) DO UPDATE
    SET quantity = inventory_stocks.quantity + EXCLUDED.quantity,
        updated_at = now();

  INSERT INTO public.inventory_movements
    (tenant_id, branch_id, inventory_center_id, product_id, movement_type, quantity, reason, reference_type, reference_id, user_id)
  VALUES
    (_tenant_id, _branch_id, _target_center_id, _product_id, _movement_type, _quantity, _reason, _reference_type, _reference_id, _user_id)
  RETURNING id INTO _movement_id;

  RETURN _movement_id;
END; $$;
