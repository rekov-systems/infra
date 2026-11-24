import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { CHANNELS, type SalesChannel } from "@/lib/channels";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Tags } from "lucide-react";
import "./channel-prices.css";


export default function ChannelPrices() {
  const { tenantId, branches } = useTenantContext();
  const qc = useQueryClient();

  // branchId === "" means "Global (all branches)"
  const [branchScope, setBranchScope] = useState<string>("__global__");


  const { data: products } = useQuery({
    queryKey: ["chprice-products", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, sku, product_type")
        .eq("tenant_id", tenantId!)
        .eq("status", "active")
        .neq("product_type", "ingredient")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: prices } = useQuery({
    queryKey: ["chprice-rows", tenantId, branchScope],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("product_channel_prices")
        .select("product_id, branch_id, channel, price")
        .eq("tenant_id", tenantId!);
      if (branchScope === "__global__") q = q.is("branch_id", null);
      else q = q.eq("branch_id", branchScope);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const priceMap = useMemo(() => {
    const m: Record<string, Record<SalesChannel, number>> = {};
    (prices ?? []).forEach((p) => {
      if (!m[p.product_id]) m[p.product_id] = {} as any;
      m[p.product_id][p.channel as SalesChannel] = Number(p.price);
    });
    return m;
  }, [prices]);

  const upsert = async (productId: string, channel: SalesChannel, value: number | null) => {
    if (!tenantId) return;
    try {
      if (value === null || isNaN(value)) {
        // delete row
        let q = supabase
          .from("product_channel_prices")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("product_id", productId)
          .eq("channel", channel);
        if (branchScope === "__global__") q = q.is("branch_id", null);
        else q = q.eq("branch_id", branchScope);
        const { error } = await q;
        if (error) throw error;
      } else {
        const payload = {
          tenant_id: tenantId,
          product_id: productId,
          channel,
          price: value,
          branch_id: branchScope === "__global__" ? null : branchScope,
        };
        // Look up existing
        let q = supabase
          .from("product_channel_prices")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("product_id", productId)
          .eq("channel", channel);
        if (branchScope === "__global__") q = q.is("branch_id", null);
        else q = q.eq("branch_id", branchScope);
        const { data: existing } = await q.maybeSingle();
        if (existing) {
          const { error } = await supabase
            .from("product_channel_prices")
            .update({ price: value })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("product_channel_prices").insert(payload);
          if (error) throw error;
        }
      }
      qc.invalidateQueries({ queryKey: ["chprice-rows"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="CATÁLOGO · PRECIOS"
        title="Precios por canal"
        description="Define un precio diferente para cada canal de venta. Deja vacío para usar el precio base."
        actions={
          <Select value={branchScope} onValueChange={setBranchScope}>
            <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__global__">Global (todas las sucursales)</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>Solo: {b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {!products || products.length === 0 ? (
        <EmptyState icon={Tags} title="Sin productos" description="Crea productos primero en el módulo Productos" />
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="grid px-5 py-3 text-xs font-semibold text-ink-400 uppercase tracking-wider border-b border-[var(--g-hairline)] g-channel-grid">
            <div>Producto</div>
            <div className="text-right">Precio base</div>
            {CHANNELS.map((c) => (
              <div key={c.id} className="text-right">{c.label}</div>
            ))}
          </div>
          <div className="divide-y divide-[var(--g-hairline)]">
            {products.map((p) => (
              <div key={p.id} className="grid items-center px-5 py-2.5 hover:bg-white/10 transition-colors g-channel-grid">
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
                {CHANNELS.map((c) => {
                  const v = priceMap[p.id]?.[c.id];
                  return (
                    <div key={c.id} className="flex justify-end">
                      <Input
                        key={`${p.id}-${c.id}-${branchScope}-${v ?? "empty"}`}
                        type="number"
                        min="0"
                        step="100"
                        placeholder="—"
                        defaultValue={v ?? ""}
                        onBlur={(e) => {
                          const newVal = e.target.value === "" ? null : Number(e.target.value);
                          if (newVal !== (v ?? null)) upsert(p.id, c.id, newVal);
                        }}
                        className="w-[130px] text-right tabular-nums h-9"
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
