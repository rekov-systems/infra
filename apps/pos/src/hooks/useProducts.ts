import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db, type CachedProduct } from "@/lib/db";

export function useProducts(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["products", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("tenant_id", tenantId!)
          .eq("status", "active")
          .neq("product_type", "ingredient")
          .order("name");

        if (error) throw error;

        const now = new Date().toISOString();
        if (data && data.length > 0) {
          // Properly typed mapping to CachedProduct
          const productsToCache: CachedProduct[] = data.map((p) => ({
            id: p.id,
            tenant_id: p.tenant_id,
            name: p.name,
            price: Number(p.price),
            tax_rate: Number(p.tax_rate ?? 0),
            category_id: p.category_id ?? null,
            image_url: p.image_url ?? null,
            sku: p.sku ?? null,
            barcode: p.barcode ?? null,
            status: p.status,
            product_type: p.product_type,
            station: p.station ?? null,
            rappi_product_id: p.rappi_product_id ?? null,
            description: p.description ?? null,
            sort_order: p.sort_order ?? null,
            _cached_at: now,
          }));

          await db.products.bulkPut(productsToCache);
        }
        return data ?? [];
      } catch (err) {
        console.error("[useProducts] Error fetching products, falling back to cache:", err);
        const cached = await db.products.where("tenant_id").equals(tenantId!).toArray();
        return cached;
      }
    },
  });
}
