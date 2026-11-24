-- Automation: Table occupancy synced with table_orders status
-- This ensures tables.status is always correct regardless of where the order was created (POS, QR, Tables)

-- 1. Create the sync function
CREATE OR REPLACE FUNCTION public.sync_table_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle Insert and Update
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    -- If the order is active, mark table as occupied
    IF NEW.status IN ('open', 'sent_to_cashier') THEN
      UPDATE public.tables SET status = 'occupied'::public.table_status WHERE id = NEW.table_id;
    -- If the order was just closed or cancelled, check if there are OTHER active orders for this table
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM public.table_orders
        WHERE table_id = NEW.table_id 
          AND status IN ('open', 'sent_to_cashier') 
          AND id <> NEW.id
      ) THEN
        UPDATE public.tables SET status = 'available'::public.table_status WHERE id = NEW.table_id;
      END IF;
    END IF;
  END IF;

  -- Handle Delete
  IF (TG_OP = 'DELETE') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.table_orders
      WHERE table_id = OLD.table_id 
        AND status IN ('open', 'sent_to_cashier')
    ) THEN
      UPDATE public.tables SET status = 'available'::public.table_status WHERE id = OLD.table_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the trigger
DROP TRIGGER IF EXISTS tr_sync_table_status ON public.table_orders;
CREATE TRIGGER tr_sync_table_status
AFTER INSERT OR UPDATE OR DELETE ON public.table_orders
FOR EACH ROW EXECUTE FUNCTION public.sync_table_status();

-- 3. Cleanup existing manual updates in RPCs
-- In create_qr_order, we can remove the manual update (it will be redundant but the trigger handles it safely)
-- However, I'll keep the RPCs as they are to avoid breaking other logic, but the trigger will ensure consistency.

-- 4. Initial sync: Ensure all current tables are correctly marked
UPDATE public.tables t
SET status = CASE 
  WHEN EXISTS (
    SELECT 1 FROM public.table_orders o 
    WHERE o.table_id = t.id AND o.status IN ('open', 'sent_to_cashier')
  ) THEN 'occupied'::public.table_status
  ELSE 'available'::public.table_status
END
WHERE t.status <> 'inactive';
