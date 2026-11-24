-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tax_id TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  payment_terms TEXT,
  notes TEXT,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_member_select" ON public.suppliers FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "suppliers_admin_all" ON public.suppliers FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]));

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | received | cancelled
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_orders_member_select" ON public.purchase_orders FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "purchase_orders_admin_all" ON public.purchase_orders FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]));

-- ============================================================
-- PURCHASE ORDER ITEMS
-- ============================================================
CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "poi_member_select" ON public.purchase_order_items FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "poi_admin_all" ON public.purchase_order_items FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]));

-- ============================================================
-- EXPENSE CATEGORIES
-- ============================================================
CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_cat_member_select" ON public.expense_categories FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "expense_cat_admin_all" ON public.expense_categories FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]));

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash', -- cash | card | transfer
  description TEXT,
  expense_date DATE NOT NULL DEFAULT current_date,
  session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_member_select" ON public.expenses FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "expenses_admin_all" ON public.expenses FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]));

-- ============================================================
-- SALE RETURNS
-- ============================================================
CREATE TABLE public.sale_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  original_sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  reason TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  items JSONB, -- snapshot: [{product_id, product_name, quantity, unit_price}]
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "returns_member_select" ON public.sale_returns FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "returns_admin_all" ON public.sale_returns FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::public.app_role[]));

-- ============================================================
-- Add address column to customers (if not exists)
-- ============================================================
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address TEXT;
