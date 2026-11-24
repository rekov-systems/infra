import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/format";
import {
  Plus, Bike, ScanLine, Receipt, Users, UtensilsCrossed,
  ChevronRight, X, Send, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { deriveOrderState, ORDER_STATE_META, countByStatus } from "@/modules/tables/itemStatus";
import { GearMark } from "@/components/shared/GearMark";
import { LiveDot } from "@/components/shared/LiveDot";

/* ─── Table detail bottom drawer ─────────────────────────────── */
function TableDrawer({ table, order, items, onClose, onNavigate }: {
  table: any; order: any; items: any[]; onClose: () => void; onNavigate: () => void;
}) {
  const totalAmt = Number(order?.total ?? 0);
  const orderState = order ? deriveOrderState(order.status, items) : null;
  const meta = orderState ? ORDER_STATE_META[orderState] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end waiter-drawer-overlay"
      onClick={onClose}
    >
      <div
        className="w-full animate-fadeup waiter-drawer-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="w-11 h-1 rounded-full bg-border mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="eyebrow eyebrow-blue">MESA</div>
            <div className="font-bold text-2xl">{table.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {table.capacity} pax · {order?.status === "open" ? "Orden abierta" : "Enviado a caja"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {meta && (
              <span className={cn("s-pill text-[10px] px-3 py-1", meta.tone)}>
                {meta.label}
              </span>
            )}
            <button
              type="button"
              aria-label="Cerrar detalle de mesa"
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Items */}
        {items.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 mb-4 space-y-1.5">
            {items.slice(0, 8).map((it: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-sm py-1.5 border-b border-border/50 last:border-0">
                <span className="flex gap-2">
                  <span className="text-primary font-mono font-semibold">×{it.quantity ?? 1}</span>
                  <span className="truncate max-w-[180px]">{it.product_name ?? it.products?.name ?? "—"}</span>
                </span>
                <span className="font-bold font-mono text-xs shrink-0">
                  {formatCurrency(Number(it.unit_price ?? 0) * Number(it.quantity ?? 1))}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2">
              <span className="eyebrow">TOTAL</span>
              <span className="big-number waiter-big-total">{formatCurrency(totalAmt)}</span>
            </div>
          </div>
        )}

        {/* Count badges */}
        {items.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-4">
            {(() => {
              const c = countByStatus(items);
              return (
                <>
                  {c.pending > 0   && <span className="s-pill s-pill-mute">{c.pending} pendiente{c.pending !== 1 ? "s" : ""}</span>}
                  {c.preparing > 0 && <span className="s-pill s-pill-warn">{c.preparing} preparando</span>}
                  {c.ready > 0     && <span className="s-pill s-pill-blue">{c.ready} listo{c.ready !== 1 ? "s" : ""}</span>}
                  {c.dispatched > 0 && <span className="s-pill s-pill-green">{c.dispatched} servido{c.dispatched !== 1 ? "s" : ""}</span>}
                </>
              );
            })()}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="btn btn-ghost flex items-center justify-center gap-2 h-12 rounded-xl"
            onClick={onNavigate}
          >
            <Send className="h-4 w-4" /> Ver comanda
          </button>
          <button
            type="button"
            className="btn btn-primary flex items-center justify-center gap-2 h-12 rounded-xl"
            onClick={onNavigate}
          >
            <Receipt className="h-4 w-4" /> Cobrar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Table card ──────────────────────────────────────────────── */
function TableCard({ table, order, items, isMine, onOpen }: {
  table: any; order: any; items: any[]; isMine: boolean; onOpen: () => void;
}) {
  const occupied = !!order;
  const state = occupied ? deriveOrderState(order.status, items) : null;
  const meta = state ? ORDER_STATE_META[state] : null;
  const totalAmt = Number(order?.total ?? 0);

  const cardClass = !occupied
    ? isMine
      ? "border-primary/40 bg-primary/5"
      : "border-border bg-card"
    : state === "preparing"  ? "border-amber-500/60 bg-amber-500/5"
    : state === "ready"      ? "border-sky-500/60 bg-sky-500/5"
    : state === "in_cashier" ? "border-warning/60 bg-warning/10"
    : state === "served"     ? "border-emerald-500/60 bg-emerald-500/5"
    : "border-primary/50 bg-primary/5";

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Mesa ${table.name}${occupied ? " – ocupada" : " – libre"}`}
      className={cn(
        "relative rounded-2xl border-2 p-3.5 text-left transition-all active:scale-95 flex flex-col gap-1.5 min-h-[120px] w-full",
        cardClass,
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-1">
        <div className="waiter-eyebrow-xs">MESA</div>
        {occupied && state === "ready"     && <span className="live-dot live-dot-blue" />}
        {occupied && state === "preparing" && <span className="live-dot live-dot-amber" />}
        {!occupied && isMine              && <span className="live-dot" />}
      </div>

      {/* Table name / number */}
      <div className="waiter-table-num">{table.name}</div>

      {/* Status */}
      {!occupied ? (
        <div className="mt-auto text-[10px] text-muted-foreground uppercase tracking-wider">
          {isMine ? "Asignada · Libre" : "Disponible"}
        </div>
      ) : (
        <div className="mt-auto space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users className="h-2.5 w-2.5" /> {table.capacity} pax
          </div>
          {meta && (
            <div className={cn("text-[10px] font-semibold", meta.tone)}>{meta.label}</div>
          )}
          {totalAmt > 0 && (
            <div className="font-bold text-sm tabular-nums text-foreground">
              {formatCurrency(totalAmt)}
            </div>
          )}
        </div>
      )}
    </button>
  );
}

/* ─── Quick action config ─────────────────────────────────────── */
const QUICK_ACTIONS = [
  { icon: Plus,     label: "Nueva",     scClass: "sc-blue",   to: "/tables"   },
  { icon: Bike,     label: "Domicilio", scClass: "sc-green",  to: "/delivery" },
  { icon: ScanLine, label: "Escanear",  scClass: "sc-purple", to: "/pos"      },
  { icon: Receipt,  label: "Cobrar",    scClass: "sc-amber",  to: "/cash"     },
] as const;

/* ─── Main dashboard ──────────────────────────────────────────── */
export default function WaiterDashboard() {
  const { tenantId, branchId, branches } = useTenantContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"mesas" | "comandas">("mesas");
  const [drawerTable, setDrawerTable] = useState<any | null>(null);

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "—";

  const { data: tables } = useQuery({
    queryKey: ["waiter-tables", tenantId, branchId],
    enabled: !!tenantId && !!branchId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tables").select("*")
        .eq("tenant_id", tenantId!).eq("branch_id", branchId!)
        .neq("status", "inactive").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: openOrders } = useQuery({
    queryKey: ["waiter-orders-open", branchId],
    enabled: !!branchId,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("table_orders")
        .select("*, tables(name, capacity), table_order_items(id, status, quantity, unit_price, product_name, products(name))")
        .eq("branch_id", branchId!)
        .in("status", ["open", "sent_to_cashier"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!branchId) return;
    const ch = supabase
      .channel(`waiter-orders-rt-${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_orders", filter: `branch_id=eq.${branchId}` }, () => {
        qc.invalidateQueries({ queryKey: ["waiter-orders-open"] });
        qc.invalidateQueries({ queryKey: ["waiter-tables"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [branchId, qc]);

  const orderByTable = useMemo(() => {
    const m: Record<string, any> = {};
    (openOrders ?? []).forEach((o: any) => { m[o.table_id] = o; });
    return m;
  }, [openOrders]);

  const itemsByOrder = useMemo(() => {
    const m: Record<string, any[]> = {};
    (openOrders ?? []).forEach((o: any) => { m[o.id] = o.table_order_items ?? []; });
    return m;
  }, [openOrders]);

  if (!tenantId || !branchId || !user) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Cargando panel…
      </div>
    );
  }

  const myTables    = (tables ?? []).filter((t: any) => t.assigned_waiter_id === user.id);
  const myOrders    = (openOrders ?? []).filter(
    (o: any) => o.waiter_id === user.id || myTables.some((t: any) => t.id === o.table_id),
  );
  const occupiedCount  = (tables ?? []).filter((t: any) => orderByTable[t.id]).length;
  const attentionCount = (openOrders ?? []).filter((o: any) => {
    const it = itemsByOrder[o.id] ?? [];
    return deriveOrderState(o.status, it) === "ready";
  }).length;
  const totalMyRevenue = myOrders.reduce((s: number, o: any) => s + Number(o.total ?? 0), 0);

  const openTable = async (tableId: string) => {
    const existing = orderByTable[tableId];
    if (existing) { navigate(`/tables/${existing.id}`); return; }
    const { data, error } = await supabase.from("table_orders").insert({
      tenant_id: tenantId, branch_id: branchId, table_id: tableId,
      waiter_id: user.id, status: "open",
    }).select().single();
    if (error) return toast.error(error.message);
    await supabase.from("tables").update({ status: "occupied" }).eq("id", tableId);
    qc.invalidateQueries({ queryKey: ["waiter-orders-open"] });
    qc.invalidateQueries({ queryKey: ["waiter-tables"] });
    navigate(`/tables/${data.id}`);
  };

  const drawerOrder = drawerTable ? orderByTable[drawerTable.id] : null;
  const drawerItems = drawerOrder ? (itemsByOrder[drawerOrder.id] ?? []) : [];

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Hero stat card ──────────────────────────────── */}
      <div className="px-4 pt-4 pb-2">
        <div className="s-glass rounded-2xl p-4 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 opacity-[0.06] pointer-events-none">
            <GearMark size={96} />
          </div>

          <div className="eyebrow eyebrow-blue mb-1">TURNO ACTIVO · {branchName}</div>
          <div className="waiter-hero-font font-bold text-lg">
            Hola, <span className="gradient-text">{user.email?.split("@")[0] ?? "Mesero"}</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-3">
            {[
              { label: "MIS MESAS", value: String(myTables.length),    color: "text-foreground" },
              { label: "OCUPADAS",  value: String(occupiedCount),       color: "text-primary"    },
              { label: "ATENCIÓN",  value: String(attentionCount),      color: "text-amber-500"  },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="waiter-eyebrow-xs">{stat.label}</div>
                <div className={cn("waiter-stat-value mt-0.5", stat.color)}>{stat.value}</div>
              </div>
            ))}
          </div>

          {totalMyRevenue > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
              <span className="waiter-eyebrow-xs">TOTAL EN MIS MESAS</span>
              <span className="big-number waiter-big-order">{formatCurrency(totalMyRevenue)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick actions ────────────────────────────────── */}
      <div className="px-4 py-3 grid grid-cols-4 gap-2">
        {QUICK_ACTIONS.map(({ icon: Icon, label, scClass, to }) => (
          <Link
            key={label}
            to={to}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-border bg-card hover:border-primary/30 transition-all active:scale-95"
          >
            <div className={cn("waiter-action-icon", scClass)}>
              <Icon className="h-4 w-4 sc-icon-color" />
            </div>
            <span className="text-[10px] font-semibold text-center leading-tight">{label}</span>
          </Link>
        ))}
      </div>

      {/* ── Tab selector ─────────────────────────────────── */}
      <div className="px-4 pb-2 flex gap-2">
        {[
          { id: "mesas",    label: "Mesas",    count: (tables ?? []).length },
          { id: "comandas", label: "Comandas", count: myOrders.length },
        ].map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id as typeof activeTab)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-semibold text-sm transition-all",
              activeTab === id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {count > 0 && (
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                activeTab === id ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
              )}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="flex-1 px-4 pb-6 overflow-y-auto">

        {/* MESAS tab */}
        {activeTab === "mesas" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="waiter-eyebrow-sm">
                {(tables ?? []).length} MESAS · SALÓN
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><LiveDot />{occupiedCount} ocupadas</span>
                {attentionCount > 0 && (
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    {attentionCount} atención
                  </span>
                )}
              </div>
            </div>

            {(tables ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <UtensilsCrossed className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No hay mesas configuradas</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {(tables ?? []).map((t: any) => {
                  const order = orderByTable[t.id];
                  const items = order ? (itemsByOrder[order.id] ?? []) : [];
                  const isMine = t.assigned_waiter_id === user.id || order?.waiter_id === user.id;
                  return (
                    <TableCard
                      key={t.id}
                      table={t}
                      order={order}
                      items={items}
                      isMine={isMine}
                      onOpen={() => { if (order) setDrawerTable(t); else openTable(t.id); }}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* COMANDAS tab */}
        {activeTab === "comandas" && (
          <div className="space-y-2">
            {myOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <CheckCircle2 className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Sin comandas activas</p>
              </div>
            ) : myOrders.map((o: any) => {
              const items = itemsByOrder[o.id] ?? [];
              const state = deriveOrderState(o.status, items);
              const meta  = state ? ORDER_STATE_META[state] : null;
              const c     = countByStatus(items);
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-label={`Abrir comanda de ${o.tables?.name ?? "Mesa"}`}
                  onClick={() => navigate(`/tables/${o.id}`)}
                  className="w-full rounded-2xl border border-border bg-card p-4 text-left flex items-center gap-3 hover:border-primary/30 active:scale-[0.99] transition-all"
                >
                  <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <UtensilsCrossed className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base">{o.tables?.name ?? "Mesa"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-2 flex-wrap">
                      {c.pending   > 0 && <span>{c.pending} pend.</span>}
                      {c.preparing > 0 && <span className="text-amber-500">{c.preparing} prep.</span>}
                      {c.ready     > 0 && <span className="text-sky-500">{c.ready} listo{c.ready !== 1 ? "s" : ""}</span>}
                      {items.length === 0 && <span>Sin ítems</span>}
                    </div>
                    {meta && <div className={cn("text-[10px] font-semibold mt-1", meta.tone)}>{meta.label}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-base tabular-nums">{formatCurrency(Number(o.total ?? 0))}</div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Table detail drawer ───────────────────────────── */}
      {drawerTable && drawerOrder && (
        <TableDrawer
          table={drawerTable}
          order={drawerOrder}
          items={drawerItems}
          onClose={() => setDrawerTable(null)}
          onNavigate={() => { navigate(`/tables/${drawerOrder.id}`); setDrawerTable(null); }}
        />
      )}
    </div>
  );
}
