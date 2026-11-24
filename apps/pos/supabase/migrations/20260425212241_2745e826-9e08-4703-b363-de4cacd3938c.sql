
-- ============================================================================
-- FOODPOS PRO — ESQUEMA COMPLETO
-- ============================================================================

-- ============== ENUMS ==============
CREATE TYPE public.app_role AS ENUM ('owner','admin','manager','cashier','kitchen','inventory','staff');
CREATE TYPE public.product_type AS ENUM ('simple','composite','production','combo','ingredient','modifier');
CREATE TYPE public.movement_type AS ENUM ('purchase','sale','production','waste','adjustment','transfer','return','consumption');
CREATE TYPE public.payment_method AS ENUM ('cash','card','transfer','qr');
CREATE TYPE public.sale_status AS ENUM ('completed','cancelled','refunded');
CREATE TYPE public.cash_session_status AS ENUM ('open','closed');
CREATE TYPE public.production_status AS ENUM ('draft','in_progress','completed','cancelled');
CREATE TYPE public.entity_status AS ENUM ('active','inactive');

-- ============== UTIL: updated_at trigger ==============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

-- ============== TENANTS / BRANCHES ==============
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  currency TEXT NOT NULL DEFAULT 'COP',
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 19.00,
  status entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  status entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_branches_tenant ON public.branches(tenant_id);
CREATE TRIGGER trg_branches_updated BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== PROFILES ==============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  default_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  default_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  pin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== USER ROLES (separate table for security) ==============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id, role, branch_id)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_tenant ON public.user_roles(tenant_id);

-- ============== SECURITY DEFINER FUNCTIONS ==============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _tenant_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND tenant_id = _tenant_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _tenant_id UUID, _roles app_role[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND role = ANY(_roles)
  );
$$;

-- ============== CATALOG: units, taxes, categories, products ==============
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#c2410c',
  icon TEXT,
  sort_order INT DEFAULT 0,
  status entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_tenant ON public.categories(tenant_id);
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  product_type product_type NOT NULL DEFAULT 'simple',
  sku TEXT,
  barcode TEXT,
  unit_id UUID REFERENCES public.units(id),
  unit_code TEXT DEFAULT 'unit',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  min_stock NUMERIC(12,3) DEFAULT 0,
  image_url TEXT,
  color TEXT,
  status entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_tenant ON public.products(tenant_id);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.product_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  parent_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,3) NOT NULL,
  waste_pct NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_components_parent ON public.product_components(parent_product_id);

-- ============== INVENTORY ==============
CREATE TABLE public.inventory_stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, product_id)
);
CREATE INDEX idx_stocks_branch ON public.inventory_stocks(branch_id);
CREATE TRIGGER trg_stocks_updated BEFORE UPDATE ON public.inventory_stocks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  movement_type movement_type NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  reason TEXT,
  reference_type TEXT,
  reference_id UUID,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_movements_tenant ON public.inventory_movements(tenant_id);
CREATE INDEX idx_movements_branch_product ON public.inventory_movements(branch_id, product_id);
CREATE INDEX idx_movements_created ON public.inventory_movements(created_at DESC);

-- ============== CUSTOMERS ==============
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  document_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== CASH ==============
CREATE TABLE public.cash_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  register_id UUID REFERENCES public.cash_registers(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  opening_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_amount NUMERIC(12,2),
  expected_amount NUMERIC(12,2),
  difference NUMERIC(12,2),
  total_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_card NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_transfer NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_qr NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_in NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_out NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  status cash_session_status NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX idx_cash_sessions_branch ON public.cash_sessions(branch_id, status);

CREATE TABLE public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('in','out')),
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== SALES ==============
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.cash_sessions(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  customer_id UUID REFERENCES public.customers(id),
  ticket_number BIGSERIAL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status sale_status NOT NULL DEFAULT 'completed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_tenant_branch ON public.sales(tenant_id, branch_id, created_at DESC);
CREATE TRIGGER trg_sales_updated BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  product_type product_type NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== PRODUCTION ==============
CREATE TABLE public.production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  user_id UUID REFERENCES auth.users(id),
  planned_quantity NUMERIC(12,3) NOT NULL,
  produced_quantity NUMERIC(12,3),
  waste_quantity NUMERIC(12,3) DEFAULT 0,
  status production_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE TRIGGER trg_production_updated BEFORE UPDATE ON public.production_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.production_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC(12,3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== EMPLOYEES & SHIFTS ==============
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  pin TEXT,
  role app_role NOT NULL DEFAULT 'staff',
  status entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.employee_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('check_in','check_out')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== AUDIT ==============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- INVENTORY HELPER: apply movement + update stock
-- ============================================================================
CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  _tenant_id UUID, _branch_id UUID, _product_id UUID,
  _movement_type movement_type, _quantity NUMERIC, _reason TEXT,
  _reference_type TEXT, _reference_id UUID, _user_id UUID
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _signed NUMERIC;
  _movement_id UUID;
BEGIN
  -- Negative for outflows, positive for inflows
  _signed := CASE _movement_type
    WHEN 'purchase' THEN _quantity
    WHEN 'production' THEN _quantity
    WHEN 'return' THEN _quantity
    WHEN 'adjustment' THEN _quantity   -- caller decides sign
    WHEN 'sale' THEN -_quantity
    WHEN 'waste' THEN -_quantity
    WHEN 'consumption' THEN -_quantity
    WHEN 'transfer' THEN -_quantity
  END;

  INSERT INTO public.inventory_stocks (tenant_id, branch_id, product_id, quantity)
  VALUES (_tenant_id, _branch_id, _product_id, _signed)
  ON CONFLICT (branch_id, product_id) DO UPDATE
    SET quantity = inventory_stocks.quantity + EXCLUDED.quantity,
        updated_at = now();

  INSERT INTO public.inventory_movements
    (tenant_id, branch_id, product_id, movement_type, quantity, reason, reference_type, reference_id, user_id)
  VALUES
    (_tenant_id, _branch_id, _product_id, _movement_type, _quantity, _reason, _reference_type, _reference_id, _user_id)
  RETURNING id INTO _movement_id;

  RETURN _movement_id;
END; $$;

-- ============================================================================
-- CHECKOUT: atomic sale + items + payments + inventory + cash session totals
-- ============================================================================
CREATE OR REPLACE FUNCTION public.checkout_sale(
  _tenant_id UUID,
  _branch_id UUID,
  _items JSONB,        -- [{product_id, quantity, unit_price, tax_rate, discount}]
  _payments JSONB,     -- [{method, amount, reference}]
  _discount_total NUMERIC DEFAULT 0,
  _notes TEXT DEFAULT NULL,
  _customer_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user_id UUID := auth.uid();
  _session_id UUID;
  _sale_id UUID;
  _subtotal NUMERIC := 0;
  _tax_total NUMERIC := 0;
  _total NUMERIC := 0;
  _item JSONB;
  _pay JSONB;
  _line_subtotal NUMERIC;
  _line_tax NUMERIC;
  _line_total NUMERIC;
  _product RECORD;
  _component RECORD;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_tenant_member(_user_id, _tenant_id) THEN
    RAISE EXCEPTION 'Forbidden: not a tenant member';
  END IF;

  -- Find open cash session for this branch
  SELECT id INTO _session_id FROM public.cash_sessions
   WHERE branch_id = _branch_id AND status = 'open'
   ORDER BY opened_at DESC LIMIT 1;

  -- Create sale
  INSERT INTO public.sales (tenant_id, branch_id, session_id, user_id, customer_id, subtotal, tax_total, discount_total, total, notes)
  VALUES (_tenant_id, _branch_id, _session_id, _user_id, _customer_id, 0, 0, _discount_total, 0, _notes)
  RETURNING id INTO _sale_id;

  -- Items loop
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT id, name, product_type, tax_rate INTO _product
      FROM public.products
     WHERE id = (_item->>'product_id')::UUID AND tenant_id = _tenant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', _item->>'product_id'; END IF;

    _line_subtotal := (_item->>'quantity')::NUMERIC * (_item->>'unit_price')::NUMERIC
                    - COALESCE((_item->>'discount')::NUMERIC, 0);
    _line_tax := _line_subtotal * COALESCE((_item->>'tax_rate')::NUMERIC, _product.tax_rate, 0) / 100.0;
    _line_total := _line_subtotal + _line_tax;

    INSERT INTO public.sale_items
      (tenant_id, sale_id, product_id, product_name, product_type, quantity, unit_price, tax_rate, discount, line_total)
    VALUES
      (_tenant_id, _sale_id, _product.id, _product.name, _product.product_type,
       (_item->>'quantity')::NUMERIC, (_item->>'unit_price')::NUMERIC,
       COALESCE((_item->>'tax_rate')::NUMERIC, _product.tax_rate, 0),
       COALESCE((_item->>'discount')::NUMERIC, 0), _line_total);

    _subtotal := _subtotal + _line_subtotal;
    _tax_total := _tax_total + _line_tax;

    -- Inventory deduction by product type
    IF _product.product_type IN ('simple','production','combo') THEN
      PERFORM public.apply_inventory_movement(
        _tenant_id, _branch_id, _product.id, 'sale',
        (_item->>'quantity')::NUMERIC, 'POS sale', 'sale', _sale_id, _user_id
      );
    ELSIF _product.product_type = 'composite' THEN
      FOR _component IN
        SELECT component_product_id, quantity, COALESCE(waste_pct,0) AS waste_pct
          FROM public.product_components
         WHERE parent_product_id = _product.id
      LOOP
        PERFORM public.apply_inventory_movement(
          _tenant_id, _branch_id, _component.component_product_id, 'consumption',
          _component.quantity * (_item->>'quantity')::NUMERIC * (1 + _component.waste_pct/100.0),
          'Composite sale', 'sale', _sale_id, _user_id
        );
      END LOOP;
    END IF;
  END LOOP;

  _total := _subtotal + _tax_total - _discount_total;

  UPDATE public.sales SET subtotal = _subtotal, tax_total = _tax_total, total = _total
   WHERE id = _sale_id;

  -- Payments + cash session totals
  FOR _pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    INSERT INTO public.payments (tenant_id, sale_id, method, amount, reference)
    VALUES (_tenant_id, _sale_id, (_pay->>'method')::payment_method,
            (_pay->>'amount')::NUMERIC, _pay->>'reference');

    IF _session_id IS NOT NULL THEN
      UPDATE public.cash_sessions SET
        total_cash = total_cash + CASE WHEN _pay->>'method' = 'cash' THEN (_pay->>'amount')::NUMERIC ELSE 0 END,
        total_card = total_card + CASE WHEN _pay->>'method' = 'card' THEN (_pay->>'amount')::NUMERIC ELSE 0 END,
        total_transfer = total_transfer + CASE WHEN _pay->>'method' = 'transfer' THEN (_pay->>'amount')::NUMERIC ELSE 0 END,
        total_qr = total_qr + CASE WHEN _pay->>'method' = 'qr' THEN (_pay->>'amount')::NUMERIC ELSE 0 END
      WHERE id = _session_id;
    END IF;
  END LOOP;

  RETURN _sale_id;
END; $$;

-- ============================================================================
-- CLOSE CASH SESSION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.close_cash_session(_session_id UUID, _counted_amount NUMERIC, _notes TEXT DEFAULT NULL)
RETURNS public.cash_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.cash_sessions;
  _expected NUMERIC;
BEGIN
  SELECT * INTO _s FROM public.cash_sessions WHERE id = _session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), _s.tenant_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _s.status = 'closed' THEN RAISE EXCEPTION 'Session already closed'; END IF;

  _expected := _s.opening_amount + _s.total_cash + _s.total_in - _s.total_out;

  UPDATE public.cash_sessions
     SET status = 'closed',
         closing_amount = _counted_amount,
         expected_amount = _expected,
         difference = _counted_amount - _expected,
         notes = COALESCE(_notes, notes),
         closed_at = now()
   WHERE id = _session_id
   RETURNING * INTO _s;
  RETURN _s;
END; $$;

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- profiles: user manages own profile
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- tenants: visible to members; only owner/admin can update
CREATE POLICY "tenants_member_select" ON public.tenants FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), id));
CREATE POLICY "tenants_authenticated_insert" ON public.tenants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tenants_admin_update" ON public.tenants FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), id, ARRAY['owner','admin']::app_role[]));

-- user_roles: members can read their tenant roles; only owner/admin manage
CREATE POLICY "roles_member_select" ON public.user_roles FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) OR user_id = auth.uid());
CREATE POLICY "roles_self_first_insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin']::app_role[]));
CREATE POLICY "roles_admin_update" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin']::app_role[]));
CREATE POLICY "roles_admin_delete" ON public.user_roles FOR DELETE TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin']::app_role[]));

-- Generic tenant-scoped policy macro applied per table
-- branches
CREATE POLICY "branches_member_select" ON public.branches FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "branches_admin_all" ON public.branches FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin']::app_role[]));

-- units / categories / products / components
CREATE POLICY "units_member_select" ON public.units FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "units_mgr_all" ON public.units FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager','inventory']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager','inventory']::app_role[]));

CREATE POLICY "categories_member_select" ON public.categories FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "categories_mgr_all" ON public.categories FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]));

CREATE POLICY "products_member_select" ON public.products FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "products_mgr_all" ON public.products FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]));

CREATE POLICY "components_member_select" ON public.product_components FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "components_mgr_all" ON public.product_components FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]));

-- inventory
CREATE POLICY "stocks_member_select" ON public.inventory_stocks FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "stocks_inv_all" ON public.inventory_stocks FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager','inventory','cashier']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager','inventory','cashier']::app_role[]));
CREATE POLICY "movements_member_select" ON public.inventory_movements FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "movements_inv_insert" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- customers
CREATE POLICY "customers_member_select" ON public.customers FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "customers_member_all" ON public.customers FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- cash
CREATE POLICY "registers_member_select" ON public.cash_registers FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "registers_admin_all" ON public.cash_registers FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]));
CREATE POLICY "cash_sessions_member_select" ON public.cash_sessions FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "cash_sessions_member_all" ON public.cash_sessions FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "cash_moves_member_select" ON public.cash_movements FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "cash_moves_member_all" ON public.cash_movements FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- sales
CREATE POLICY "sales_member_select" ON public.sales FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "sales_member_insert" ON public.sales FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "sales_mgr_update" ON public.sales FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]));
CREATE POLICY "sale_items_member_select" ON public.sale_items FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "sale_items_member_insert" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "payments_member_select" ON public.payments FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "payments_member_insert" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- production
CREATE POLICY "prod_orders_member_select" ON public.production_orders FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "prod_orders_kitchen_all" ON public.production_orders FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager','kitchen']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager','kitchen']::app_role[]));
CREATE POLICY "prod_cons_member_select" ON public.production_consumptions FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "prod_cons_kitchen_insert" ON public.production_consumptions FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- employees
CREATE POLICY "employees_member_select" ON public.employees FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "employees_admin_all" ON public.employees FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]));
CREATE POLICY "shifts_member_select" ON public.employee_shifts FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "shifts_mgr_all" ON public.employee_shifts FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin','manager']::app_role[]));
CREATE POLICY "attendance_member_select" ON public.attendance_logs FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "attendance_member_insert" ON public.attendance_logs FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- audit
CREATE POLICY "audit_admin_select" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), tenant_id, ARRAY['owner','admin']::app_role[]));
CREATE POLICY "audit_member_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
