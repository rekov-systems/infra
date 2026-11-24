import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Bike, Trash2, Phone, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatCurrency, formatDate } from "@/lib/format";
import { resolvePrice } from "@/lib/channels";
import { Button } from "@/components/ui/button";
import type { Database } from "@/integrations/supabase/types";

type DeliveryStatus = Database["public"]["Enums"]["delivery_status"];

const STATUSES: { id: DeliveryStatus; label: string; pillClass: string }[] = [
  { id: "received",  label: "Recibido",  pillClass: "s-pill s-pill-mute" },
  { id: "preparing", label: "Preparando",pillClass: "s-pill s-pill-warn" },
  { id: "ready",     label: "Listo",     pillClass: "s-pill s-pill-blue" },
  { id: "assigned",  label: "Asignado",  pillClass: "s-pill s-pill-blue" },
  { id: "on_way",    label: "En camino", pillClass: "s-pill s-pill-green" },
  { id: "delivered", label: "Entregado", pillClass: "s-pill s-pill-green" },
  { id: "cancelled", label: "Cancelado", pillClass: "s-pill s-pill-danger" },
];

const NEXT_STATUS: Record<DeliveryStatus, DeliveryStatus | null> = {
  received: "preparing",
  preparing: "ready",
  ready: "assigned",
  assigned: "on_way",
  on_way: "delivered",
  delivered: null,
  cancelled: null,
};

type LineDraft = {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
};

export default function Delivery() {
  const { tenantId, branchId, branches } = useTenantContext();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    address: "",
    neighborhood: "",
    delivery_fee: "",
    notes: "",
  });
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["delivery-orders", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_orders")
        .select("*")
        .eq("branch_id", branchId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 20000,
  });

  const { data: couriers } = useQuery({
    queryKey: ["couriers", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, full_name, role")
        .eq("tenant_id", tenantId!)
        .eq("status", "active");
      return data ?? [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["delivery-products", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, price, tax_rate, sku, product_type")
        .eq("tenant_id", tenantId!)
        .eq("status", "active")
        .neq("product_type", "ingredient")
        .order("name");
      return data ?? [];
    },
  });

  const { data: chPrices } = useQuery({
    queryKey: ["delivery-chprices", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("product_channel_prices")
        .select("product_id, branch_id, channel, price")
        .eq("tenant_id", tenantId!);
      return data ?? [];
    },
  });

  const { data: branchProducts } = useQuery({
    queryKey: ["delivery-bprods", branchId],
    enabled: !!branchId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_products")
        .select("product_id, branch_id, is_available, local_price")
        .eq("branch_id", branchId!);
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = (products ?? []).filter((p) => {
      const bp = (branchProducts ?? []).find((b) => b.product_id === p.id);
      return !bp || bp.is_available;
    });
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(s) || (p.sku ?? "").toLowerCase().includes(s));
    }
    return list.slice(0, 12);
  }, [products, branchProducts, search]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    STATUSES.forEach((s) => (g[s.id] = []));
    (orders ?? []).forEach((o) => {
      if (g[o.status]) g[o.status].push(o);
    });
    return g;
  }, [orders]);

  const resetForm = () => {
    setForm({ customer_name: "", customer_phone: "", address: "", neighborhood: "", delivery_fee: "", notes: "" });
    setLines([]);
    setSearch("");
  };

  const addProduct = (p: any) => {
    const price = resolvePrice(p.id, Number(p.price), branchId, "delivery", chPrices ?? [], branchProducts ?? []);
    setLines((prev) => {
      const ex = prev.find((l) => l.product_id === p.id);
      if (ex) return prev.map((l) => (l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...prev,
        { product_id: p.id, name: p.name, quantity: 1, unit_price: price, tax_rate: Number(p.tax_rate) || 0 },
      ];
    });
    setSearch("");
  };

  const total = useMemo(
    () =>
      lines.reduce((s, l) => s + l.quantity * l.unit_price * (1 + (l.tax_rate || 0) / 100), 0) +
      (Number(form.delivery_fee) || 0),
    [lines, form.delivery_fee]
  );

  const submit = async () => {
    if (!tenantId || !branchId) return;
    if (!form.address.trim()) return toast.error("Dirección requerida");
    if (lines.length === 0) return toast.error("Agrega productos");
    setSubmitting(true);
    try {
      const items = lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        tax_rate: l.tax_rate,
        discount: 0,
      }));
      const { error } = await supabase.rpc("register_delivery_order", {
        _tenant_id: tenantId,
        _branch_id: branchId,
        _items: items as any,
        _customer_name: form.customer_name || null,
        _customer_phone: form.customer_phone || null,
        _address: form.address,
        _neighborhood: form.neighborhood || null,
        _delivery_fee: Number(form.delivery_fee) || 0,
        _customer_id: null,
        _notes: form.notes || null,
      });
      if (error) throw error;
      toast.success("Domicilio registrado");
      qc.invalidateQueries({ queryKey: ["delivery-orders"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      setOpen(false);
      resetForm();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: DeliveryStatus, courier_id?: string | null) => {
    const { error } = await supabase.rpc("update_delivery_status", {
      _order_id: id,
      _status: status,
      _courier_id: courier_id ?? null,
    });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["delivery-orders"] });
  };

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "—";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="OPERACIÓN · DOMICILIOS"
        title="Domicilios propios"
        description={`Tablero de pedidos a domicilio · ${branchName}`}
        actions={
          <button type="button" className="g-btn g-btn-primary" onClick={() => { resetForm(); setOpen(true); }}>
            <Plus size={15} className="mr-1" /> Nuevo domicilio
          </button>
        }
      />

      {isLoading ? (
        <div className="h-meta py-6">Cargando…</div>
      ) : (orders?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Bike}
          title="Sin domicilios"
          description="Registra tu primer pedido a domicilio para empezar el tablero"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STATUSES.filter((s) => s.id !== "cancelled").map((col) => (
            <div key={col.id} className="flex flex-col gap-2">
              {/* Column header */}
              <div className="flex items-center justify-between px-1">
                <span className="h-label font-semibold uppercase tracking-wider">{col.label}</span>
                <span className="s-pill s-pill-mute">{grouped[col.id].length}</span>
              </div>

              <div className="flex flex-col gap-2 min-h-[80px]">
                {grouped[col.id].length === 0 && (
                  <div className="glass-thin rounded-xl px-3 py-6 text-center h-meta border border-dashed border-[var(--hairline)]">
                    Vacío
                  </div>
                )}

                {grouped[col.id].map((o) => {
                  const next = NEXT_STATUS[o.status as DeliveryStatus];
                  return (
                    <div key={o.id} className="glass rounded-2xl p-3 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-sm text-ink-900 leading-tight">
                          {o.customer_name || "Sin nombre"}
                        </div>
                        <span className={col.pillClass}>{col.label}</span>
                      </div>

                      <div className="flex flex-col gap-0.5 text-xs text-ink-500">
                        {o.customer_phone && (
                          <div className="flex items-center gap-1">
                            <Phone size={11} />{o.customer_phone}
                          </div>
                        )}
                        <div className="flex items-start gap-1">
                          <MapPin size={11} className="mt-0.5 shrink-0" />
                          <span>{o.address}{o.neighborhood ? ` · ${o.neighborhood}` : ""}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock size={11} />{formatDate(o.created_at)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--hairline)]">
                        <span className="h-meta">Envío</span>
                        <span className="tabular-nums text-ink-900 font-semibold">{formatCurrency(Number(o.delivery_fee))}</span>
                      </div>

                      {(col.id === "ready" || col.id === "assigned") && (couriers?.length ?? 0) > 0 && (
                        <Select
                          value={o.courier_id ?? undefined}
                          onValueChange={(v) => updateStatus(o.id, "assigned", v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Asignar domiciliario" />
                          </SelectTrigger>
                          <SelectContent>
                            {(couriers ?? []).map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      <div className="flex gap-1.5">
                        {next && (
                          <button
                            type="button"
                            className="g-btn g-btn-primary g-btn-sm flex-1"
                            onClick={() => updateStatus(o.id, next)}
                          >
                            → {STATUSES.find((s) => s.id === next)?.label}
                          </button>
                        )}
                        {o.status !== "delivered" && o.status !== "cancelled" && (
                          <button
                            type="button"
                            className="g-btn g-btn-ghost g-btn-sm text-red-500"
                            onClick={() => updateStatus(o.id, "cancelled")}
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nuevo domicilio</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <Label>Cliente</Label>
                <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} />
              </div>
              <div>
                <Label>Dirección</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <Label>Barrio / zona</Label>
                <Input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
              </div>
              <div>
                <Label>Costo de envío</Label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={form.delivery_fee}
                  onChange={(e) => setForm({ ...form, delivery_fee: e.target.value })}
                />
              </div>
              <div>
                <Label>Notas</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Agregar productos</Label>
              <Input placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && (
                <ScrollArea className="h-44 border rounded-lg">
                  <div className="divide-y">
                    {filtered.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => addProduct(p)}
                        className="w-full text-left px-3 py-2 hover:bg-muted/40 flex items-center justify-between text-sm"
                      >
                        <span>{p.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatCurrency(
                            resolvePrice(p.id, Number(p.price), branchId, "delivery", chPrices ?? [], branchProducts ?? [])
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
              <div className="glass rounded-2xl p-3">
                {lines.length === 0 ? (
                  <div className="h-meta py-3 text-center">Sin items todavía</div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-auto">
                    {lines.map((l) => (
                      <div key={l.product_id} className="flex items-center gap-2 text-sm">
                        <Input
                          type="number"
                          min="1"
                          value={l.quantity}
                          onChange={(e) => {
                            const q = Math.max(1, Number(e.target.value) || 1);
                            setLines((prev) => prev.map((x) => (x.product_id === l.product_id ? { ...x, quantity: q } : x)));
                          }}
                          className="w-16 h-8 text-center tabular-nums"
                        />
                        <div className="flex-1 truncate">{l.name}</div>
                        <div className="tabular-nums w-24 text-right">
                          {formatCurrency(l.unit_price * l.quantity * (1 + (l.tax_rate || 0) / 100))}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setLines((prev) => prev.filter((x) => x.product_id !== l.product_id))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-[var(--hairline)] flex justify-between font-bold">
                  <span className="h-label">Total</span>
                  <span className="tabular-nums text-brand-600 h-num g-val-16">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={submitting || lines.length === 0}>Registrar domicilio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
