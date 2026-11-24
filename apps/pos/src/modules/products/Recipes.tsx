import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { EmptyState } from "@/components/shared/EmptyState";
import { ChefHat, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/format";

const TYPE_LABELS: Record<string, string> = {
  simple: "Simple",
  composite: "Compuesto",
  production: "Producción",
  combo: "Combo",
  ingredient: "Ingrediente",
  modifier: "Modificador"
};

export default function Recipes() {
  const { tenantId } = useTenantContext();

  const { data: recipes } = useQuery({
    queryKey: ["recipes", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("products")
        .select("id, name, price, cost, product_type, product_components(id, quantity, waste_pct, component:products!product_components_component_product_id_fkey(name, cost, unit_code))")
        .eq("tenant_id", tenantId!)
        .in("product_type", ["composite", "production", "combo"])
        .order("name");
      return (data ?? []).filter((p: any) => p.product_components?.length > 0);
    },
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="h-display g-page-title">Recetas</div>
          <div className="h-meta g-page-subtitle">Productos con ingredientes/componentes definidos · CATÁLOGO</div>
        </div>
        <Link to="/products" className="g-btn g-btn-ghost">
          Ir a productos
        </Link>
      </div>

      {!recipes || recipes.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title="Aún no hay recetas"
          description="Crea o edita un producto de tipo 'composite', 'production' o 'combo' y añade sus componentes desde la pestaña Receta."
          action={<Link to="/products" className="g-btn g-btn-primary">Ir a productos</Link>}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {recipes.map((r: any) => {
            const totalCost = r.product_components.reduce((s: number, c: any) => {
              const cc = Number(c.component?.cost ?? 0);
              return s + cc * Number(c.quantity) * (1 + Number(c.waste_pct ?? 0) / 100);
            }, 0);
            const margin = Number(r.price) - totalCost;

            return (
              <div key={r.id} className="glass rounded-2xl p-5">
                {/* Card header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-semibold text-lg">{r.name}</div>
                    <span className="pill pill-ghost mt-1 inline-block">
                      {TYPE_LABELS[r.product_type] || r.product_type}
                    </span>
                  </div>
                  <Link
                    to="/products"
                    className="g-btn g-btn-ghost g-btn-icon"
                    title="Editar producto"
                    aria-label="Editar producto"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                </div>

                {/* Ingredients list */}
                <ul className="text-sm space-y-1 border-t pt-3">
                  {r.product_components.map((c: any) => (
                    <li key={c.id} className="flex justify-between">
                      <span>{c.component?.name}</span>
                      <span className="text-ink-400 tabular-nums">
                        {Number(c.quantity).toFixed(2)} {c.component?.unit_code ?? ""}
                        {Number(c.waste_pct) > 0 && ` (+${c.waste_pct}%)`}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Cost / price / margin KPIs */}
                <div className="border-t mt-3 pt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="h-label text-xs">Costo</div>
                    <div className="font-semibold tabular-nums">{formatCurrency(totalCost)}</div>
                  </div>
                  <div>
                    <div className="h-label text-xs">Precio</div>
                    <div className="font-semibold tabular-nums">{formatCurrency(Number(r.price))}</div>
                  </div>
                  <div>
                    <div className="h-label text-xs">Margen</div>
                    <div className={`font-semibold tabular-nums ${margin < 0 ? "text-g-bad" : "text-g-ok"}`}>
                      {formatCurrency(margin)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
