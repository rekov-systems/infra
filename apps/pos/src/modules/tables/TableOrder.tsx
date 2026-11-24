import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useProducts } from "@/hooks/useProducts";
import { useDevMode } from "@/hooks/useDevMode";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/format";
import { ArrowLeft, Search, Plus, Minus, Trash2, Send, CreditCard, ChefHat, Bell, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useOfflineMutation } from "@/hooks/useOfflineMutation";
import { PaymentDialog, type PayMethod } from "@/modules/pos/PaymentDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { resolvePrice } from "@/lib/channels";
import { useIsMobile } from "@/hooks/use-mobile";
import { TableOrderMobile } from "./TableOrderMobile";
import { ITEM_STATUS_META, deriveOrderState, ORDER_STATE_META, countByStatus, type TableItemStatus } from "./itemStatus";
import { db } from "@/lib/db";

export default function TableOrder() {
  const { id: orderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { tenantId, branchId } = useTenantContext();
  const { devMode } = useDevMode();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [payOpen, setPayOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDetailProduct, setPendingDetailProduct] = useState<any | null>(null);
  const [detailInput, setDetailInput] = useState("");

  const { data: order, isLoading: loadingOrder, error: orderError } = useQuery({
    queryKey: ["table-order", orderId],
    enabled: !!orderId,
    refetchInterval: 10000,
    retry: 3,
    retryDelay: 800,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("table_orders").select("*, tables(name, capacity)")
        .eq("id", orderId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: waiterName } = useQuery({
    queryKey: ["waiter-name", order?.waiter_id],
    enabled: !!order?.waiter_id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", order!.waiter_id!).maybeSingle();
      return data?.full_name ?? null;
    },
  });

  const { data: items, refetch: refetchItems } = useQuery({
    queryKey: ["table-order-items", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("table_order_items").select("*").eq("order_id", orderId!).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["table-categories", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("categories")
        .select("id, name").eq("tenant_id", tenantId!).eq("status", "active").order("name");
      return data ?? [];
    },
  });

  const { data: products } = useProducts(tenantId);

  const { data: branchProducts } = useQuery({
    queryKey: ["table-branch-products", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      try {
        const { data } = await supabase.from("branch_products")
          .select("product_id, branch_id, is_available, local_price").eq("branch_id", branchId!);
        const now = new Date().toISOString();
        if (data && data.length > 0) {
          await db.branch_products.bulkPut(data.map(bp => ({
            id: `${bp.product_id}:${bp.branch_id}`,
            product_id: bp.product_id,
            branch_id: bp.branch_id,
            is_available: bp.is_available,
            local_price: bp.local_price ?? null,
            _cached_at: now,
          })));
        }
        return data ?? [];
      } catch {
        const cached = await db.branch_products.where("branch_id").equals(branchId!).toArray();
        return cached.map(bp => ({
          product_id: bp.product_id,
          branch_id: bp.branch_id,
          is_available: bp.is_available,
          local_price: bp.local_price,
        }));
      }
    },
  });

  const { data: channelPrices } = useQuery({
    queryKey: ["table-channel-prices", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("product_channel_prices")
        .select("product_id, branch_id, channel, price").eq("tenant_id", tenantId!);
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const list = (products ?? []).map((p) => ({
      ...p,
      price: resolvePrice(p.id, Number(p.price), branchId, "pos", channelPrices ?? [], branchProducts ?? []),
    }));
    let res = list;
    if (selectedCategory !== "all") {
      res = res.filter((p) => p.category_id === selectedCategory);
    }
    if (!search) return res;
    const q = search.toLowerCase();
    return res.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q));
  }, [products, branchProducts, channelPrices, branchId, search, selectedCategory]);

  const recalc = async () => {
    if (!orderId) return;
    await supabase.rpc("recalc_table_order", { _order_id: orderId });
    qc.invalidateQueries({ queryKey: ["table-order", orderId] });
    qc.invalidateQueries({ queryKey: ["table-orders-open"] });
  };

  const insertProduct = async (p: any, notes?: string) => {
    if (!tenantId || !orderId) return;
    const existing = items?.find((i) => i.product_id === p.id && i.status === "pending" && !notes);
    if (existing) {
      const newQty = Number(existing.quantity) + 1;
      const lineSub = newQty * Number(existing.unit_price) - Number(existing.discount);
      await supabase.from("table_order_items").update({
        quantity: newQty,
        line_total: lineSub + (lineSub * Number(existing.tax_rate) / 100),
      }).eq("id", existing.id);
    } else {
      const lineSub = Number(p.price);
      await supabase.from("table_order_items").insert({
        tenant_id: tenantId, order_id: orderId, product_id: p.id,
        product_name: p.name, product_type: p.product_type,
        quantity: 1, unit_price: Number(p.price), tax_rate: Number(p.tax_rate ?? 0), discount: 0,
        line_total: lineSub + (lineSub * Number(p.tax_rate ?? 0) / 100),
        status: "pending",
        notes: notes?.trim() || null,
      });
    }
    await refetchItems();
    await recalc();
  };

  const addProduct = async (p: any) => {
    if (!tenantId || !orderId || order?.status !== "open") return;
    if (p.requires_detail) {
      setPendingDetailProduct(p);
      setDetailInput("");
      return;
    }
    await insertProduct(p);
  };

  const confirmDetail = async () => {
    if (!pendingDetailProduct) return;
    await insertProduct(pendingDetailProduct, detailInput);
    setPendingDetailProduct(null);
    setDetailInput("");
  };

  const setQty = async (item: any, qty: number) => {
    if (qty <= 0) {
      await supabase.from("table_order_items").delete().eq("id", item.id);
    } else {
      const lineSub = qty * Number(item.unit_price) - Number(item.discount);
      await supabase.from("table_order_items").update({
        quantity: qty,
        line_total: lineSub + (lineSub * Number(item.tax_rate) / 100),
      }).eq("id", item.id);
    }
    await refetchItems();
    await recalc();
  };

  const startPreparing = async (item: any) => {
    const { error } = await supabase.rpc("start_preparing_table_item", { _item_id: item.id });
    if (error) return toast.error(error.message);
    await refetchItems();
  };

  const markReady = async (item: any) => {
    const { error } = await supabase.rpc("mark_table_item_ready", { _item_id: item.id });
    if (error) return toast.error(error.message);
    await refetchItems();
  };

  const dispatchItem = async (item: any) => {
    const { error } = await supabase.rpc("dispatch_table_item", { _item_id: item.id });
    if (error) return toast.error(error.message);
    await refetchItems();
  };

  const undispatchItem = async (item: any) => {
    const { error } = await supabase.rpc("undispatch_table_item", { _item_id: item.id });
    if (error) return toast.error(error.message);
    toast.success("Revertido a pendiente");
    await refetchItems();
  };

  const setItemStatus = async (item: any, target: TableItemStatus) => {
    if (item.status === target) return;
    if (target === "preparing") return startPreparing(item);
    if (target === "ready") return markReady(item);
    if (target === "dispatched") return dispatchItem(item);
  };

  const sendKitchenMutation = useOfflineMutation({
    type: 'SEND_TO_KITCHEN',
    mutationFn: async (payload: { _order_id: string }) => {
      const { data, error } = await supabase.rpc("send_table_order_to_kitchen", payload);
      if (error) throw error;
      return data;
    }
  });

  const sendAllToKitchen = async () => {
    if (!orderId) return;
    try {
      const data = await sendKitchenMutation.mutateAsync({ _order_id: orderId });
      toast.success(`${data ?? 0} item(s) enviados a cocina`);
    } catch (err: any) {
      toast.error(err.message);
    }
    await refetchItems();
    qc.invalidateQueries({ queryKey: ["table-order", orderId] });
    qc.invalidateQueries({ queryKey: ["table-orders-open"] });
    qc.invalidateQueries({ queryKey: ["pending-table-orders"] });
    qc.invalidateQueries({ queryKey: ["tables"] });
  };

  const markReadyMutation = useOfflineMutation({
    type: 'MARK_ORDER_READY',
    mutationFn: async (payload: { _order_id: string }) => {
      const { data, error } = await supabase.rpc("mark_table_order_ready", payload);
      if (error) throw error;
      return data;
    }
  });

  const markAllReady = async () => {
    if (!orderId) return;
    try {
      const data = await markReadyMutation.mutateAsync({ _order_id: orderId });
      toast.success(`${data ?? 0} item(s) listos`);
    } catch (err: any) {
      toast.error(err.message);
    }
    await refetchItems();
  };

  const sendCashierMutation = useOfflineMutation({
    type: 'SEND_TO_CASHIER',
    mutationFn: async (payload: { _order_id: string }) => {
      const { error } = await supabase.rpc("send_table_order_to_cashier", payload);
      if (error) throw error;
    }
  });

  const sendToCashier = async () => {
    if (!orderId) return;
    const activeItems = (items ?? []).filter((i: any) => i.status !== "cancelled");
    if (activeItems.length === 0) return toast.error("Agrega al menos un producto");
    const ready = activeItems.some((i: any) => i.status === "ready" || i.status === "dispatched");
    if (!ready) {
      const ok = confirm("Aún no marcas items como listos o servidos. ¿Enviar igualmente a caja?");
      if (!ok) return;
    }

    try {
      await sendCashierMutation.mutateAsync({ _order_id: orderId });
      toast.success("Enviado a caja · El cajero podrá cobrar desde su pantalla");
    } catch (err: any) {
      toast.error(err.message);
    }

    qc.invalidateQueries({ queryKey: ["table-order", orderId] });
    qc.invalidateQueries({ queryKey: ["table-orders-open"] });
    qc.invalidateQueries({ queryKey: ["pending-table-orders"] });
    navigate("/tables");
  };

  const checkoutTableMutation = useOfflineMutation({
    type: 'CHECKOUT_TABLE_ORDER',
    mutationFn: async (payload: any) => {
      const { error } = await supabase.rpc("checkout_table_order", payload);
      if (error) throw error;
    }
  });

  const charge = async (
    method: PayMethod,
    _tendered: number,
    tipAmount: number,
    couponCode?: string,
    discountAmount = 0,
  ) => {
    if (!orderId) return;
    setSubmitting(true);
    try {
      const baseTotal = Number(order?.total ?? 0);
      const payableTotal = Math.max(0, baseTotal - discountAmount + tipAmount);
      await checkoutTableMutation.mutateAsync({
        _order_id: orderId,
        _payments: [{ method, amount: payableTotal, reference: null }] as any,
        _tip_amount: tipAmount,
        _discount_total: discountAmount,
        _coupon_code: couponCode ?? null,
      });
      toast.success("Cobro registrado");
      setPayOpen(false);
      qc.invalidateQueries({ queryKey: ["table-orders-open"] });
      qc.invalidateQueries({ queryKey: ["tables"] });
      navigate("/tables");
    } catch (err: any) {
      toast.error(err.message ?? "Error al cobrar");
    } finally { setSubmitting(false); }
  };

  const cancelOrder = async () => {
    if (!orderId || !order) return;
    if (!confirm("¿Cancelar este pedido? Se revertirán los items despachados.")) return;
    // Revertir despachos
    for (const it of (items ?? [])) {
      if (it.status === "dispatched") {
        await supabase.rpc("undispatch_table_item", { _item_id: it.id });
      }
    }
    await supabase.from("table_orders").update({ status: "cancelled", closed_at: new Date().toISOString() }).eq("id", orderId);
    // Manual status update removed: handled by database trigger
    toast.success("Pedido cancelado");
    qc.invalidateQueries({ queryKey: ["table-orders-open"] });
    qc.invalidateQueries({ queryKey: ["tables"] });
    navigate("/tables");
  };

  const isMobile = useIsMobile();

  // ── Estados de carga y error ──────────────────────────────────────────────
  if (loadingOrder) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 text-[var(--ink-400)]">
        <div className="h-8 w-8 rounded-full border-4 border-[var(--brand-600)] border-t-transparent animate-spin" />
        <p className="h-meta">Abriendo pedido...</p>
      </div>
    );
  }

  if (orderError || !order) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-4xl">⚠️</div>
        <p className="font-semibold text-[var(--ink-900)]">No se pudo cargar el pedido</p>
        <p className="h-meta">
          {(orderError as any)?.message ?? "El pedido no existe o fue cancelado."}
        </p>
        <button type="button" className="g-btn g-btn-ghost" onClick={() => navigate("/tables")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver a mesas
        </button>
      </div>
    );
  }

  const isOpen = order.status === "open";
  const sent = order.status === "sent_to_cashier";

  if (isMobile) {
    return (
      <>
        <TableOrderMobile
          order={order}
          items={items ?? []}
          filtered={filtered}
          search={search}
          setSearch={setSearch}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          categories={categories ?? []}
          isOpen={isOpen}
          sent={sent}
          devMode={devMode}
          onBack={() => navigate("/tables")}
          onAdd={addProduct}
          onSetQty={setQty}
          onSetItemStatus={setItemStatus}
          onUndispatch={undispatchItem}
          onSendToKitchen={sendAllToKitchen}
          onMarkAllReady={markAllReady}
          onSendToCashier={sendToCashier}
          onCancel={cancelOrder}
          onPay={() => setPayOpen(true)}
        />
        <PaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          total={Number(order.total)}
          tenantId={tenantId}
          submitting={submitting}
          onConfirm={charge}
        />
        <Dialog open={!!pendingDetailProduct} onOpenChange={(o) => { if (!o) setPendingDetailProduct(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Detalle para {pendingDetailProduct?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <p className="h-meta">Este producto requiere un detalle que se enviará al KDS de cocina.</p>
              <Textarea
                placeholder="Ej: Término 3/4, sin cebolla, extra salsa…"
                value={detailInput}
                onChange={e => setDetailInput(e.target.value)}
                autoFocus
                rows={3}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPendingDetailProduct(null)}>Cancelar</Button>
              <Button onClick={confirmDetail} disabled={!detailInput.trim()}>Agregar al pedido</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--g-hairline)] glass-thin shrink-0">
        <button type="button" className="g-btn g-btn-ghost" onClick={() => navigate("/tables")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Mesas
        </button>
        <div className="g-title-18">{(order as any).tables?.name ?? "Mesa"}</div>
        {sent && <span className="g-pill g-pill-warn g-pill-h22">Enviado a caja</span>}
        {isOpen && <span className="g-pill g-pill-brand g-pill-h22">Abierto</span>}
        {waiterName ? (
          <span className="h-meta">
            Mesero: <span className="font-semibold text-[var(--ink-700)]">{waiterName}</span>
          </span>
        ) : !(order as any)?.waiter_id ? (
          <span className="text-xs font-semibold text-[var(--brand-600)]">📱 Pedido QR</span>
        ) : null}
        <div className="flex-1" />
        {isOpen && (
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ink-400)]" />
            <Input
              placeholder="Buscar producto..."
              className="pl-9 h-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_440px] overflow-hidden min-h-0">

        {/* Left: Product picker (only when open) */}
        <div className="overflow-hidden min-h-0 border-r border-[var(--g-hairline)] flex flex-col">
          {isOpen ? (
            <>
              {/* Category filter bar */}
              <div className="px-4 py-2 border-b border-[var(--g-hairline)] glass-thin shrink-0">
                <ScrollArea className="w-full whitespace-nowrap">
                  <div className="flex w-max gap-2 p-1">
                    <button
                      type="button"
                      className={cn("g-pill g-pill-h28 transition-all", selectedCategory === "all" ? "g-pill-brand" : "g-pill-ghost")}
                      onClick={() => setSelectedCategory("all")}
                    >
                      Todos
                    </button>
                    {(categories ?? []).map((cat: any) => (
                      <button
                        key={cat.id}
                        type="button"
                        className={cn("g-pill g-pill-h28 transition-all", selectedCategory === cat.id ? "g-pill-brand" : "g-pill-ghost")}
                        onClick={() => setSelectedCategory(cat.id)}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" className="hidden" />
                </ScrollArea>
              </div>

              {/* Product grid */}
              <ScrollArea className="flex-1">
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {filtered.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="glass group rounded-xl p-3 text-left transition-all active:scale-95 min-h-[110px] flex flex-col justify-between"
                    >
                      <div className="font-medium text-sm line-clamp-2 text-[var(--ink-900)]">{p.name}</div>
                      <div className="h-num text-sm text-[var(--brand-600)] mt-2">{formatCurrency(Number(p.price))}</div>
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <div className="col-span-full text-center py-12 h-meta">Sin productos</div>
                  )}
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex-1 grid place-items-center h-meta p-8 text-center">
              Pedido enviado a caja. Pendiente de cobro por el cajero.
            </div>
          )}
        </div>

        {/* Right: Order panel */}
        <div className="flex flex-col glass-thin overflow-hidden min-h-0">

          {/* Order header / controls */}
          <div className="px-4 py-3 border-b border-[var(--g-hairline)] space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-label uppercase tracking-wider">Pedido</div>
                <div className="text-sm text-[var(--ink-700)]">
                  {(items ?? []).length} items ·{" "}
                  <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-bold", ORDER_STATE_META[deriveOrderState(order.status, items ?? [])].tone)}>
                    {ORDER_STATE_META[deriveOrderState(order.status, items ?? [])].label}
                  </span>
                </div>
              </div>
            </div>

            {/* Status counts */}
            {(() => {
              const c = countByStatus(items ?? []);
              return (
                <div className="flex flex-wrap gap-1">
                  {c.pending > 0 && <span className="g-pill g-pill-ghost g-pill-h20">{c.pending} pend</span>}
                  {c.preparing > 0 && <span className="g-pill g-pill-warn g-pill-h20">{c.preparing} prep</span>}
                  {c.ready > 0 && <span className="g-pill g-pill-sky g-pill-h20">{c.ready} listo</span>}
                  {c.dispatched > 0 && <span className="g-pill g-pill-ok g-pill-h20">{c.dispatched} servido</span>}
                </div>
              );
            })()}

            {/* Kitchen / ready action buttons */}
            {isOpen && (() => {
              const c = countByStatus(items ?? []);
              return (
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    className="g-btn g-btn-ghost text-xs h-8"
                    disabled={c.pending === 0}
                    onClick={sendAllToKitchen}
                  >
                    <ChefHat className="h-3 w-3 mr-1" /> A cocina
                  </button>
                  <button
                    type="button"
                    className="g-btn g-btn-ghost text-xs h-8"
                    disabled={c.preparing === 0 && c.pending === 0}
                    onClick={markAllReady}
                  >
                    <Bell className="h-3 w-3 mr-1" /> Marcar listo
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Order item list */}
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {(items ?? []).length === 0 && (
                <div className="text-center h-meta py-12">
                  Sin productos. Agrega desde la izquierda.
                </div>
              )}
              {(items ?? []).map((it) => {
                const status = it.status as TableItemStatus;
                const cancelled = status === "cancelled";
                const dispatched = status === "dispatched";
                const meta = ITEM_STATUS_META[status];
                const steps: TableItemStatus[] = ["pending", "preparing", "ready", "dispatched"];
                const idx = steps.indexOf(status);
                return (
                  <div
                    key={it.id}
                    className={cn(
                      "glass rounded-xl p-3 space-y-2",
                      cancelled && "opacity-50",
                      status === "preparing" && "border border-[var(--g-warn)]/30",
                      status === "ready" && "border border-sky-400/30",
                      dispatched && "border border-[var(--g-ok)]/30"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm line-clamp-2 text-[var(--ink-900)]">{it.product_name}</div>
                        <div className="h-meta tabular-nums">
                          {formatCurrency(Number(it.unit_price))} × {Number(it.quantity)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", meta.tone)}>
                          {meta.short}
                        </span>
                        <div className="h-num text-sm mt-1">{formatCurrency(Number(it.line_total))}</div>
                      </div>
                    </div>

                    {/* Status stepper */}
                    {!cancelled && (isOpen || sent) && (
                      <div className="flex gap-1">
                        {steps.map((s, i) => {
                          const stepMeta = ITEM_STATUS_META[s];
                          const active = i === idx;
                          const done = i < idx;
                          const reachable = i === idx + 1 && isOpen;
                          return (
                            <button
                              key={s}
                              type="button"
                              disabled={!reachable && !active}
                              onClick={() => reachable && setItemStatus(it, s)}
                              className={cn(
                                "flex-1 h-8 rounded text-[10px] font-bold uppercase tracking-wider transition-all border",
                                active
                                  ? `${stepMeta.tone} border-transparent`
                                  : done
                                    ? "bg-[var(--g-hairline)] text-[var(--ink-400)] border-transparent line-through"
                                    : reachable
                                      ? "border-dashed border-[var(--brand-600)]/40 text-[var(--brand-600)] hover:bg-[var(--brand-50)]"
                                      : "border-dashed border-[var(--g-hairline)] text-[var(--ink-400)]/40 cursor-not-allowed"
                              )}
                            >
                              {stepMeta.short}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Qty / delete / revert controls */}
                    {isOpen && !cancelled && status !== "dispatched" && (
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" aria-label="Reducir cantidad" className="g-btn g-btn-ghost h-7 w-7 p-0" onClick={() => setQty(it, Number(it.quantity) - 1)}>
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center font-semibold text-sm text-[var(--ink-900)]">{Number(it.quantity)}</span>
                        <button type="button" aria-label="Aumentar cantidad" className="g-btn g-btn-ghost h-7 w-7 p-0" onClick={() => setQty(it, Number(it.quantity) + 1)}>
                          <Plus className="h-3 w-3" />
                        </button>
                        <button type="button" aria-label="Eliminar ítem" className="g-btn g-btn-ghost h-7 w-7 p-0 text-[var(--g-bad)]" onClick={() => setQty(it, 0)}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    {dispatched && isOpen && (
                      <div className="flex justify-end">
                        <button type="button" className="g-btn g-btn-ghost h-7 text-xs" onClick={() => undispatchItem(it)}>
                          <RotateCcw className="h-3 w-3 mr-1" /> Revertir
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Totals & action footer */}
          <div className="border-t border-[var(--g-hairline)] p-4 space-y-3 glass-thin shrink-0">
            <div className="flex items-baseline justify-between">
              <span className="h-label">Subtotal</span>
              <span className="tabular-nums text-[var(--ink-700)]">{formatCurrency(Number(order.subtotal))}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="h-label">Impuestos</span>
              <span className="tabular-nums text-[var(--ink-700)]">{formatCurrency(Number(order.tax_total))}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-[var(--g-hairline)] pt-2">
              <span className="font-bold text-[var(--ink-900)]">Total</span>
              <span className="h-num text-2xl text-[var(--brand-600)]">{formatCurrency(Number(order.total))}</span>
            </div>
            {isOpen && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="g-btn g-btn-ghost" onClick={cancelOrder}>
                  <Trash2 className="h-4 w-4 mr-2" /> Cancelar
                </button>
                <button
                  type="button"
                  className="g-btn g-btn-primary"
                  onClick={sendToCashier}
                  disabled={(items ?? []).length === 0}
                >
                  <Send className="h-4 w-4 mr-2" /> Enviar a caja
                </button>
              </div>
            )}
            {(isOpen || sent) && (
              <button
                type="button"
                className="g-btn g-btn-primary g-btn-touch w-full"
                onClick={() => setPayOpen(true)}
                disabled={Number(order.total) <= 0}
              >
                <CreditCard className="h-5 w-5 mr-2" /> Cobrar {formatCurrency(Number(order.total))}
              </button>
            )}
          </div>
        </div>
      </div>

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        total={Number(order.total)}
        tenantId={tenantId}
        submitting={submitting}
        onConfirm={charge}
      />

      <Dialog open={!!pendingDetailProduct} onOpenChange={(o) => { if (!o) setPendingDetailProduct(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Detalle para {pendingDetailProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="h-meta">Este producto requiere un detalle que se enviará al KDS de cocina.</p>
            <Textarea
              placeholder="Ej: Término 3/4, sin cebolla, extra salsa…"
              value={detailInput}
              onChange={e => setDetailInput(e.target.value)}
              autoFocus
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingDetailProduct(null)}>Cancelar</Button>
            <Button onClick={confirmDetail} disabled={!detailInput.trim()}>Agregar al pedido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
