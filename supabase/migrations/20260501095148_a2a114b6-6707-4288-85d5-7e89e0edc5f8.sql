-- Add new statuses to table_item_status enum
ALTER TYPE public.table_item_status ADD VALUE IF NOT EXISTS 'preparing' BEFORE 'dispatched';
ALTER TYPE public.table_item_status ADD VALUE IF NOT EXISTS 'ready' BEFORE 'dispatched';

-- Add timing columns
ALTER TABLE public.table_order_items
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;