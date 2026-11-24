import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Layers } from "lucide-react";

export default function Catalog() {
  const { tenantId, branches } = useTenantContext();
  const qc = useQueryClient();
  const [branchId, setBranchId] = useState<string | undefined>(undefined);

  // Default selected branch
  const selected = branchId ?? branches[0]?.id;

  const { data: products } = useQuery({
    queryKey: ["catalog-products", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, sku, product_type, status, category_id")
        .eq("tenant_id", tenantId!)
        .eq("status", "active")
        .neq("product_type", "ingredient")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: bp } = useQuery({
    queryKey: ["catalog-branch-products", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_products")
        .select("product_id, is_available, local_price")
        .eq("branch_id", selected!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const bpMap = useMemo(() => {
    const m: Record<string, { is_available: boolean; local_price: number | null }> = {};
    (bp ?? []).forEach((r) => {
      m[r.product_id] = { is_available: r.is_available, local_price: r.local_price };
    });
    return m;
  }, [bp]);

  const upsert = async (
    productId: string,
    patch: { is_available?: boolean; local_price?: number | null }
  ) => {
    if (!tenantId || !selected) return;
    const current = bpMap[productId] ?? { is_available: true, local_price: null };
    const next = { ...current, ...patch };
    const { error } = await supabase
      .from("branch_products")
      .upsert(
        {
          tenant_id: tenantId,
          branch_id: selected,
          product_id: productId,
          is_available: next.is_available,
          local_price: next.local_price,
        },
        { onConflict: "branch_id,product_id" }
      );
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["catalog-branch-products", selected] });
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="CATÁLOGO · SUCURSAL"
        title="Catálogo por sucursal"
        description="Activa o desactiva productos y define precios locales por sucursal"
        actions={
          branches.length > 0 && (
            <Select value={selected ?? undefined} onValueChange={setBranchId}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />

      {!selected ? (
        <EmptyState icon={Layers} title="Selecciona una sucursal" description="Elige la sucursal cuyo catálogo deseas configurar" />
      ) : !products || products.length === 0 ? (
        <EmptyState icon={Layers} title="Sin productos" description="Crea productos primero en el módulo Productos" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_180px_120px] px-5 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider border-b border-[var(--g-hairline)]">
            <div>Producto</div>
            <div className="text-right">Precio base</div>
            <div className="text-right">Precio local</div>
            <div className="text-center">Disponible</div>
          </div>
          <div className="divide-y divide-[var(--g-hairline)]">
            {products.map((p) => {
              const row = bpMap[p.id];
              const available = row?.is_available ?? true;
              const local = row?.local_price;
              return (
                <div key={p.id} className="grid grid-cols-[1fr_120px_180px_120px] items-center px-5 py-3 hover:bg-white/10 transition-colors">
                  <div>
                    <div className="font-medium text-ink-900">{p.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.sku && <span className="h-meta text-xs">SKU {p.sku}</span>}
                      <span className="g-pill g-pill-ghost g-pill-h22">{p.product_type}</span>
                    </div>
                  </div>
                  <div className="text-right tabular-nums h-meta">
                    {formatCurrency(Number(p.price))}
                  </div>
                  <div className="flex justify-end">
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="Usar base"
                      defaultValue={local ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        if (v !== (local ?? null)) upsert(p.id, { local_price: v });
                      }}
                      className="w-[140px] text-right tabular-nums h-9"
                    />
                  </div>
                  <div className="flex justify-center">
                    <Switch checked={available} onCheckedChange={(v) => upsert(p.id, { is_available: v })} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
