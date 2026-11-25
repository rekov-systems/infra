-- Add missing FK from table_orders.table_id to tables.id
-- PostgREST requires this to resolve .select("*, tables(...)") joins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'table_orders_table_id_fkey'
      AND conrelid = 'public.table_orders'::regclass
  ) THEN
    ALTER TABLE public.table_orders
      ADD CONSTRAINT table_orders_table_id_fkey
      FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE RESTRICT;
  END IF;
END $$;
