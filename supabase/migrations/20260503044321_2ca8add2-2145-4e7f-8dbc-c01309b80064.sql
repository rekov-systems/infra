DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.table_orders';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.table_order_items';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;

ALTER TABLE public.table_orders REPLICA IDENTITY FULL;
ALTER TABLE public.table_order_items REPLICA IDENTITY FULL;