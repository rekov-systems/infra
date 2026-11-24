import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, ChefHat } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

interface RecipeEditorProps {
  tenantId: string;
  parentProductId: string;
}

export function RecipeEditor({ tenantId, parentProductId }: RecipeEditorProps) {
  const qc = useQueryClient();

  const { data: components } = useQuery({
    queryKey: ["product-components", parentProductId],
    enabled: !!parentProductId,
    queryFn: async () => (await supabase.from("product_components")
      .select("*, component:products!product_components_component_product_id_fkey(id, name, cost, unit_code)")
      .eq("parent_product_id", parentProductId)).data ?? [],
  });

  const { data: candidates } = useQuery({
    queryKey: ["recipe-candidates", tenantId],
    queryFn: async () => (await supabase.from("products")
      .select("id, name, cost, unit_code, product_type")
      .eq("tenant_id", tenantId).in("product_type", ["ingredient", "simple", "production", "composite"])
      .order("name")).data ?? [],
  });

  const [componentId, setComponentId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [waste, setWaste] = useState("0");

  const totalCost = (components ?? []).reduce((s: number, c: any) => {
    const cost = Number(c.component?.cost ?? 0);
    return s + cost * Number(c.quantity) * (1 + Number(c.waste_pct ?? 0) / 100);
  }, 0);

  const addComponent = async () => {
    if (!componentId || !quantity) return;
    const { error } = await supabase.from("product_components").insert({
      tenant_id: tenantId,
      parent_product_id: parentProductId,
      component_product_id: componentId,
      quantity: Number(quantity),
      waste_pct: Number(waste),
    });
    if (error) return toast.error(error.message);
    toast.success("Componente añadido");
    setComponentId(""); setQuantity("1"); setWaste("0");
    qc.invalidateQueries({ queryKey: ["product-components", parentProductId] });
  };

  const removeComponent = async (id: string) => {
    const { error } = await supabase.from("product_components").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["product-components", parentProductId] });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Add ingredient */}
      <div className="glass-thin p-4 rounded-2xl">
        <div className="flex items-center gap-2 h-label mb-3">
          <ChefHat size={14} className="g-recipe-add-icon" />
          Añadir ingrediente
        </div>
        <div className="g-recipe-add-grid">
          <div className="space-y-1">
            <Label className="text-xs">Componente</Label>
            <Select value={componentId} onValueChange={setComponentId}>
              <SelectTrigger><SelectValue placeholder="Producto..." /></SelectTrigger>
              <SelectContent>
                {(candidates ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} <span className="text-muted-foreground text-xs">({c.unit_code})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cantidad</Label>
            <Input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Merma %</Label>
            <Input type="number" value={waste} onChange={(e) => setWaste(e.target.value)} />
          </div>
          <button type="button" className="g-btn g-btn-primary g-recipe-add-btn"
            onClick={addComponent} disabled={!componentId}>
            <Plus size={14} /> Añadir
          </button>
        </div>
      </div>

      {/* Component list */}
      <div className="glass g-recipe-list rounded-2xl overflow-hidden">
        <div className="g-recipe-head">
          <span className="font-semibold text-sm">Componentes ({components?.length ?? 0})</span>
          <span className="h-meta">
            Costo total: <strong className="h-num g-recipe-cost-val">{formatCurrency(totalCost)}</strong>
          </span>
        </div>
        {(components ?? []).length === 0 ? (
          <div className="px-4 py-8 text-center h-meta">
            Sin componentes. Añade ingredientes que se descontarán del inventario al producir.
          </div>
        ) : (
          (components ?? []).map((c: any) => (
            <div key={c.id} className="g-recipe-row">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{c.component?.name}</div>
                <div className="h-meta tabular-nums">
                  {Number(c.quantity).toFixed(2)} {c.component?.unit_code ?? ""} · merma {Number(c.waste_pct ?? 0)}%
                  {" · "}costo {formatCurrency(Number(c.component?.cost ?? 0) * Number(c.quantity) * (1 + Number(c.waste_pct ?? 0) / 100))}
                </div>
              </div>
              <button type="button" className="g-btn g-btn-ghost g-recipe-del-btn"
                title="Eliminar" onClick={() => removeComponent(c.id)}>
                <Trash2 size={14} className="g-recipe-del-icon" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
