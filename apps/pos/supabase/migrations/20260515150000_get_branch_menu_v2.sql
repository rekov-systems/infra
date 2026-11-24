-- get_branch_menu v2: adds tenant branding, product description, sort_order and stock status
CREATE OR REPLACE FUNCTION public.get_branch_menu(_branch_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH branch_row AS (
    SELECT
      b.id, b.tenant_id, b.name,
      t.name          AS tenant_name,
      t.logo_url      AS tenant_logo,
      t.primary_color AS tenant_color
    FROM public.branches b
    JOIN public.tenants t ON t.id = b.tenant_id
    WHERE b.id = _branch_id
      AND b.status = 'active'
  ),
  -- Sum stock across all centers per product for this branch
  branch_stock AS (
    SELECT product_id, COALESCE(SUM(quantity), 0) AS total_stock
    FROM public.inventory_stocks
    WHERE branch_id = _branch_id
    GROUP BY product_id
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM branch_row) THEN NULL
    ELSE jsonb_build_object(
      'branch', (
        SELECT jsonb_build_object(
          'id',           id,
          'name',         name,
          'tenant_id',    tenant_id,
          'tenant_name',  tenant_name,
          'tenant_logo',  tenant_logo,
          'tenant_color', tenant_color
        )
        FROM branch_row
      ),
      'categories', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',               c.id,
            'name',             c.name,
            'color',            c.color,
            'schedule_enabled', c.schedule_enabled,
            'schedule_from',    c.schedule_from,
            'schedule_until',   c.schedule_until,
            'schedule_days',    c.schedule_days,
            'products', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id',          p.id,
                  'name',        p.name,
                  'description', p.description,
                  'price',       COALESCE(bp.local_price, p.price),
                  'tax_rate',    p.tax_rate,
                  'image_url',   p.image_url,
                  'sort_order',  p.sort_order,
                  -- stock: null means no inventory record (unrestricted), 0+ means tracked
                  'stock',       bs.total_stock,
                  'has_stock_record', (bs.product_id IS NOT NULL)
                )
                ORDER BY p.sort_order, p.name
              )
              FROM public.products p
              LEFT JOIN public.branch_products bp
                ON bp.product_id = p.id AND bp.branch_id = _branch_id
              LEFT JOIN branch_stock bs
                ON bs.product_id = p.id
              WHERE p.tenant_id = c.tenant_id
                AND p.category_id = c.id
                AND p.status = 'active'
                AND p.product_type <> 'ingredient'
                AND COALESCE(bp.is_available, true) = true
            ), '[]'::jsonb)
          )
          ORDER BY c.sort_order, c.name
        )
        FROM public.categories c
        JOIN branch_row br ON br.tenant_id = c.tenant_id
        WHERE c.status = 'active'
      ), '[]'::jsonb)
    )
  END;
$$;
