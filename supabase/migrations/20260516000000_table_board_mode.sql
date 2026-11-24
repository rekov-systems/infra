-- Añadir coordenadas a las mesas
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS x_pos NUMERIC(5,2) DEFAULT NULL;
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS y_pos NUMERIC(5,2) DEFAULT NULL;

-- Añadir el modo de vista a las sucursales
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS table_view_mode TEXT DEFAULT 'cards';
