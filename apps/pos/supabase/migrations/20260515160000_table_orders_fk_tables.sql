-- Add missing FK from table_orders.table_id to tables.id
-- PostgREST requires this to resolve .select("*, tables(...)") joins
ALTER TABLE public.table_orders
  ADD CONSTRAINT table_orders_table_id_fkey
  FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE RESTRICT;
