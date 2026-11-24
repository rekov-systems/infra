import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Smartphone, Trash2, ClipboardList, MapPin, User, Clock } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatCurrency, formatDate } from "@/lib/format";
import { resolvePrice, type SalesChannel } from "@/lib/channels";

type LineDraft = {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
};

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
};

type DigitalOrder = {
  id: string;
  channel: string;
  external_order_number: string | null;
  gross_total: number;
  platform_commission: number;
  net_total: number;
  status: string;
  external_status: string | null;
  delivery_address: string | null;
  notes: string | null;
  sale_id: string | null;
  rappi_order_id: string | null;
  table_id: string | null;
  created_at: string;
  digital_order_items: OrderItem[];
  tables: { name: string } | null;
};

const PLATFORMS: { value: SalesChannel; label: string }[] = [
  { value: "rappi",    label: "Rappi" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "didi",     label: "Didi Food" },
  { value: "uber",     label: "Uber Eats" },
  { value: "delivery", label: "Domicilio propio" },
];

const CHANNEL_PILL: Record<string, string> = {
  whatsapp: "s-pill s-pill-green",
  rappi:    "s-pill s-pill-warn",
  didi:     "s-pill s-pill-warn",
  uber:     "s-pill s-pill-mute",
  delivery: "s-pill s-pill-blue",
  qr:       "s-pill",
};

function ComandaModal({ order, onClose, onConfirm, onRappiAction }: {
  order: DigitalOrder;
  onClose: () => void;
  onConfirm: (id: string) => void;
  onRappiAction: (id: string, action: string) => void;
}) {
  const isRappi = order.channel === "rappi" && order.rappi_order_id;
  const ext = order.external_status;

  const notesParts = (order.notes ?? "").split(" · ").map((s) => s.trim()).filter(Boolean);

  const minutesAgo = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
  const timeLabel = minutesAgo < 60
    ? `hace ${minutesAgo} min`
    : `hace ${Math.floor(minutesAgo / 60)}h ${minutesAgo % 60}min`;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 flex items-start justify-between border-b border-[var(--hairline)]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`${CHANNEL_PILL[order.channel] ?? "s-pill s-pill-mute"} capitalize`}>
                {order.channel}
              </span>
              <span className="font-bold text-base text-ink-900">#{order.external_order_number ?? "—"}</span>
              {order.channel === "qr" && order.tables?.name && (
                <span className="text-sm font-semibold text-brand-600">· {order.tables.name}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 h-meta">
              <Clock size={11} />
              <span>{formatDate(order.created_at)} · {timeLabel}</span>
            </div>
          </div>
          {ext && (
            <span className="s-pill s-pill-mute capitalize">{ext}</span>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Items */}
          <div>
            <div className="flex items-center gap-1.5 h-meta uppercase tracking-wider mb-2">
              <ClipboardList size={12} />
              Ítems del pedido
            </div>
            {order.digital_order_items?.length > 0 ? (
              <div className="space-y-1.5">
                {order.digital_order_items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg orb text-xs font-bold">
                        {item.quantity}
                      </span>
                      <span className="font-medium text-ink-900">{item.product_name}</span>
                    </div>
                    <span className="tabular-nums h-meta">
                      {formatCurrency(Number(item.line_total))}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="h-meta">Sin ítems registrados</p>
            )}
          </div>

          <div className="border-t border-[var(--hairline)]" />

          {/* Totals */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-ink-500">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(Number(order.gross_total))}</span>
            </div>
            {Number(order.platform_commission) > 0 && (
              <div className="flex justify-between text-red-500">
                <span>Comisión</span>
                <span className="tabular-nums">−{formatCurrency(Number(order.platform_commission))}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t border-[var(--hairline)]">
              <span className="text-ink-900">Total</span>
              <span className="tabular-nums text-brand-600">{formatCurrency(Number(order.net_total))}</span>
            </div>
          </div>

          {/* Delivery address */}
          {order.delivery_address && (
            <>
              <div className="border-t border-[var(--hairline)]" />
              <div>
                <div className="flex items-center gap-1.5 h-meta uppercase tracking-wider mb-2">
                  <MapPin size={12} />
                  Dirección de entrega
                </div>
                <p className="text-sm font-medium glass-thin rounded-xl px-3 py-2">
                  {order.delivery_address}
                </p>
              </div>
            </>
          )}

          {/* Notes */}
          {notesParts.length > 0 && (
            <>
              <div className="border-t border-[var(--hairline)]" />
              <div>
                <div className="flex items-center gap-1.5 h-meta uppercase tracking-wider mb-2">
                  <User size={12} />
                  Notas del pedido
                </div>
                <div className="space-y-1">
                  {notesParts.map((part, i) => (
                    <p key={i} className="text-sm text-ink-500">{part}</p>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t border-[var(--hairline)] flex gap-2 flex-wrap justify-end">
          <button type="button" className="g-btn g-btn-ghost g-btn-sm" onClick={onClose}>Cerrar</button>
          {!order.sale_id && order.status !== "cancelled" && (
            <button type="button" className="g-btn g-btn-primary g-btn-sm" onClick={() => { onConfirm(order.id); onClose(); }}>
              Confirmar venta
            </button>
          )}
          {isRappi && (ext === "pending" || !ext) && (
            <>
              <button type="button" className="g-btn g-btn-primary g-btn-sm" onClick={() => onRappiAction(order.rappi_order_id!, "take")}>Aceptar</button>
              <button type="button" className="g-btn g-btn-ghost g-btn-sm" onClick={() => onRappiAction(order.rappi_order_id!, "reject")}>Rechazar</button>
            </>
          )}
          {isRappi && ext === "accepted" && (
            <button type="button" className="g-btn g-btn-ghost g-btn-sm" onClick={() => onRappiAction(order.rappi_order_id!, "ready")}>Marcar listo</button>
          )}
          {isRappi && ext === "ready" && (
            <button type="button" className="g-btn g-btn-ghost g-btn-sm" onClick={() => onRappiAction(order.rappi_order_id!, "dispatched")}>Despachado</button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DigitalOrders() {
  const { tenantId, branchId, branches } = useTenantContext();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<SalesChannel>("rappi");
  const [externalNo, setExternalNo] = useState("");
  const [commission, setCommission] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DigitalOrder | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["digital-orders", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("digital_orders")
        .select("*, digital_order_items(*), tables(name)")
        .eq("branch_id", branchId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as DigitalOrder[];
    },
  });

  useEffect(() => {
    if (!branchId) return;
    const ch = supabase
      .channel(`digital-orders-${branchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "digital_orders", filter: `branch_id=eq.${branchId}` },
        () => qc.invalidateQueries({ queryKey: ["digital-orders", branchId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [branchId, qc]);

  const rappiAction = async (orderId: string, action: "take" | "reject" | "ready" | "dispatched") => {
    try {
      const { data, error } = await supabase.functions.invoke("rappi-order-action", {
        body: { order_id: orderId, action },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Acción "${action}" enviada a Rappi`);
      qc.invalidateQueries({ queryKey: ["digital-orders"] });
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo enviar la acción");
    }
  };

  const confirmOrder = async (orderId: string) => {
    try {
      const { error } = await supabase.rpc("confirm_digital_order" as any, { _order_id: orderId });
      if (error) throw error;
      toast.success("Pedido confirmado como venta");
      qc.invalidateQueries({ queryKey: ["digital-orders"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["pos-stocks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo confirmar el pedido");
    }
  };

  const { data: products } = useQuery({
    queryKey: ["digital-products", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, price, tax_rate, product_type, sku")
        .eq("tenant_id", tenantId!)
        .eq("status", "active")
        .neq("product_type", "ingredient")
        .order("name");
      return data ?? [];
    },
  });

  const { data: chPrices } = useQuery({
    queryKey: ["digital-chprices", tenantId],
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
    queryKey: ["digital-bprods", branchId],
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

  const resetForm = () => {
    setChannel("rappi");
    setExternalNo("");
    setCommission("");
    setNotes("");
    setLines([]);
    setSearch("");
  };

  const addProduct = (p: any) => {
    const price = resolvePrice(p.id, Number(p.price), branchId, channel, chPrices ?? [], branchProducts ?? []);
    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === p.id);
      if (existing) {
        return prev.map((l) => (l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        { product_id: p.id, name: p.name, quantity: 1, unit_price: price, tax_rate: Number(p.tax_rate) || 0 },
      ];
    });
    setSearch("");
  };

  const grossTotal = useMemo(
    () => lines.reduce((s, l) => s + l.quantity * l.unit_price * (1 + (l.tax_rate || 0) / 100), 0),
    [lines]
  );
  const commissionNum = Number(commission) || 0;
  const netTotal = Math.max(0, grossTotal - commissionNum);

  const submit = async () => {
    if (!tenantId || !branchId) return;
    if (lines.length === 0) return toast.error("Agrega productos");
    setSubmitting(true);
    try {
      const itemsPayload = lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        tax_rate: l.tax_rate,
        discount: 0,
      }));
      const { error } = await supabase.rpc("register_digital_order", {
        _tenant_id: tenantId,
        _branch_id: branchId,
        _channel: channel,
        _external_no: externalNo || null,
        _items: itemsPayload as any,
        _commission: commissionNum,
        _notes: notes || null,
      });
      if (error) throw error;
      toast.success("Pedido digital registrado");
      qc.invalidateQueries({ queryKey: ["digital-orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      setOpen(false);
      resetForm();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "—";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="OPERACIÓN · PLATAFORMAS"
        title="Pedidos digitales"
        description={`Rappi, plataformas y otros canales digitales · ${branchName}`}
        actions={
          <button type="button" className="g-btn g-btn-primary" onClick={() => { resetForm(); setOpen(true); }}>
            <Plus size={15} className="mr-1" /> Nuevo pedido
          </button>
        }
      />

      {isLoading ? (
        <div className="h-meta py-6">Cargando…</div>
      ) : !orders || orders.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title="Sin pedidos digitales"
          description="Registra pedidos de Rappi u otras plataformas para llevar control de comisiones y ventas netas"
        />
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[100px_140px_110px_1fr_110px_110px_190px] px-5 py-3 border-b border-[var(--hairline)] text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            <div>Canal</div>
            <div>Pedido</div>
            <div>Estado</div>
            <div className="text-right">Bruto</div>
            <div className="text-right">Comisión</div>
            <div className="text-right">Neto</div>
            <div className="text-right">Acciones</div>
          </div>

          <div className="divide-y divide-[var(--hairline)]">
            {orders.map((o) => {
              const isRappi = o.channel === "rappi" && o.rappi_order_id;
              const ext = o.external_status;
              const itemCount = o.digital_order_items?.length ?? 0;
              return (
                <div
                  key={o.id}
                  className="grid grid-cols-[100px_140px_110px_1fr_110px_110px_190px] items-center px-5 py-3 text-sm gap-2 hover:bg-white/5 transition-colors"
                >
                  <span className={`${CHANNEL_PILL[o.channel] ?? "s-pill s-pill-mute"} capitalize`}>
                    {o.channel}
                  </span>
                  <div>
                    <div className="font-medium text-ink-900">#{o.external_order_number ?? "—"}</div>
                    <div className="h-meta">{formatDate(o.created_at)}</div>
                    {o.channel === "qr" && o.tables?.name && (
                      <div className="text-xs font-semibold text-brand-600">{o.tables.name}</div>
                    )}
                  </div>
                  <div>
                    {ext
                      ? <span className="s-pill s-pill-mute capitalize">{ext}</span>
                      : <span className="h-meta">—</span>
                    }
                  </div>
                  <div className="text-right tabular-nums text-ink-900">{formatCurrency(Number(o.gross_total))}</div>
                  <div className="text-right tabular-nums text-red-500">−{formatCurrency(Number(o.platform_commission))}</div>
                  <div className="text-right tabular-nums font-semibold text-ink-900">{formatCurrency(Number(o.net_total))}</div>
                  <div className="flex justify-end gap-1 flex-wrap">
                    <button
                      type="button"
                      className="g-btn g-btn-ghost g-btn-sm gap-1"
                      onClick={() => setSelectedOrder(o)}
                    >
                      <ClipboardList size={12} />
                      Comanda{itemCount > 0 ? ` (${itemCount})` : ""}
                    </button>
                    {!o.sale_id && o.status !== "cancelled" && (
                      <button type="button" className="g-btn g-btn-primary g-btn-sm" onClick={() => confirmOrder(o.id)}>
                        Confirmar
                      </button>
                    )}
                    {isRappi && (ext === "pending" || !ext) && (
                      <>
                        <button type="button" className="g-btn g-btn-primary g-btn-sm" onClick={() => rappiAction(o.rappi_order_id!, "take")}>Aceptar</button>
                        <button type="button" className="g-btn g-btn-ghost g-btn-sm" onClick={() => rappiAction(o.rappi_order_id!, "reject")}>Rechazar</button>
                      </>
                    )}
                    {isRappi && ext === "accepted" && (
                      <button type="button" className="g-btn g-btn-ghost g-btn-sm" onClick={() => rappiAction(o.rappi_order_id!, "ready")}>Marcar listo</button>
                    )}
                    {isRappi && ext === "ready" && (
                      <button type="button" className="g-btn g-btn-ghost g-btn-sm" onClick={() => rappiAction(o.rappi_order_id!, "dispatched")}>Despachado</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedOrder && (
        <ComandaModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onConfirm={confirmOrder}
          onRappiAction={(id, action) => rappiAction(id, action as any)}
        />
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nuevo pedido digital</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <Label>Plataforma</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as SalesChannel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>N° de pedido externo</Label>
                <Input value={externalNo} onChange={(e) => setExternalNo(e.target.value)} placeholder="Ej. RAP-12345" />
              </div>
              <div>
                <Label>Comisión plataforma</Label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Notas</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Agregar productos</Label>
              <Input
                placeholder="Buscar producto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
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
                            resolvePrice(p.id, Number(p.price), branchId, channel, chPrices ?? [], branchProducts ?? [])
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
                  <div className="space-y-2 max-h-44 overflow-auto">
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
                <div className="mt-3 pt-3 border-t border-[var(--hairline)] space-y-1 text-sm">
                  <div className="flex justify-between text-ink-500">
                    <span>Total bruto</span>
                    <span className="tabular-nums">{formatCurrency(grossTotal)}</span>
                  </div>
                  <div className="flex justify-between text-red-500">
                    <span>Comisión</span>
                    <span className="tabular-nums">−{formatCurrency(commissionNum)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base pt-1 border-t border-[var(--hairline)]">
                    <span className="text-ink-900">Neto estimado</span>
                    <span className="tabular-nums text-brand-600">{formatCurrency(netTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={submitting || lines.length === 0}>Registrar pedido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
