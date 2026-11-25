-- Commit the enum value in its own migration before policies/functions use it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
