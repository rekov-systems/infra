-- Commit the enum label before tenant settings use it in a column default.
ALTER TYPE public.sales_channel ADD VALUE IF NOT EXISTS 'qr';
