-- Update sales_channel enum to support Didi Food and Uber Eats
DO $$ BEGIN
  ALTER TYPE public.sales_channel ADD VALUE IF NOT EXISTS 'didi';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE public.sales_channel ADD VALUE IF NOT EXISTS 'uber';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
