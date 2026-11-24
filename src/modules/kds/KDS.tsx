import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { cn } from "@/lib/utils";
import { ChefHat, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import type { Database, Json } from "@/integrations/supabase/types";

type TableItemStatus = Database["public"]["Enums"]["table_item_status"];

interface KDSItem {
  id: string;
  quantity: number;
  product_id: string;
  product_name: string;
  modifiers: Json;
  status: TableItemStatus;
  created_at: string;
  notes: string | null;
  order_id: string;
  products: { station: string | null } | null;
  table_orders: { tables: { name: string } | null } | null;
}

interface Modifier { name: string; price?: number }

const STATIONS = ["Todas", "Cocina", "Bar", "Parrilla", "Frío", "Postres"];
const SLA_MINUTES = 15;

function elapsedMinutes(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
  } catch { /* ignore */ }
}

function playWarningBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "triangle"; osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8);
  } catch { /* ignore */ }
}

function playCriticalBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sawtooth"; osc.frequency.value = 220;
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.5, ctx.currentTime + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8);
  } catch { /* ignore */ }
}

function TimerRing({ elapsed, sla }: { elapsed: number; sla: number }) {
  const ratio = elapsed / sla;
  const late   = ratio >= 1;
  const urgent = ratio > 0.8;
  const R  = 24;
  const C  = 2 * Math.PI * R;
  const ringColor = late ? "var(--g-bad)" : urgent ? "var(--g-warn)" : "var(--brand-500)";
  return (
    <div className="g-kds-timer">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={R} fill="none" stroke="rgba(14,31,61,0.08)" strokeWidth="3.5" />
        <circle cx="26" cy="26" r={R} fill="none" stroke={ringColor} strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${Math.min(1, ratio) * C} ${C}`}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <div className="g-kds-timer-inner">
        <span className={cn("g-kds-timer-val h-num", late && "text-g-bad")}>{elapsed}&apos;</span>
        <span className="g-kds-timer-sla">/{sla}&apos;</span>
      </div>
    </div>
  );
}

interface KDSCardProps {
  orderId: string;
  items: KDSItem[];
  elapsed: number;
  onPreparing: (id: string) => void;
  onDispatched: (id: string) => void;
}

function KDSCard({ orderId, items, elapsed, onPreparing, onDispatched }: KDSCardProps) {
  const ratio   = elapsed / SLA_MINUTES;
  const late    = ratio >= 1;
  const urgent  = ratio > 0.8;
  const tableName = items[0]?.table_orders?.tables?.name ?? "Mesa";


  return (
    <div className={cn("glass-strong g-kds-card", late ? "g-kds-card-late" : "g-kds-card-normal")}>
      {/* Header */}
      <div className={cn("g-kds-card-head", late ? "g-kds-card-head-late" : urgent ? "g-kds-card-head-urgent" : "g-kds-card-head-normal")}>
        <div className="g-kds-card-head-info">
          <div className="g-kds-card-id h-display">{tableName}</div>
          <div className="g-kds-card-table">{items.length} ítem{items.length !== 1 ? "s"  : ""}</div>
        </div>
        <TimerRing elapsed={elapsed} sla={SLA_MINUTES} />
      </div>

      {/* Items */}
      <div className="g-kds-items">
        {items.map((item) => {
          const mods = (item.modifiers as Modifier[]) ?? [];
          const ready = item.status === "ready" || item.status === "dispatched";
          const preparing = item.status === "preparing";
          return (
            <div key={item.id} className="g-kds-item">
              <span className={cn("g-kds-item-qty h-num", ready ? "g-kds-item-qty-ok" : "g-kds-item-qty-new")}>
                ×{item.quantity}
              </span>
              <div className="flex-1 min-w-0">
                <div className={cn("g-kds-item-name", ready && "g-kds-item-name-ok")}>
                  {item.product_name}
                </div>
                {mods.length > 0 && (
                  <div className="g-kds-item-mods">
                    {mods.map((m, idx) => <span key={idx}>{idx > 0 ? " · " : ""}{m.name}</span>)}
                  </div>
                )}
                {item.notes && <div className="g-kds-item-mods">{item.notes}</div>}
              </div>
              {ready && <span className="pill pill-ok g-kds-pill-micro">Lista</span>}
              {preparing && <span className="pill pill-warn g-kds-pill-micro">Prep.</span>}
              {item.status === "pending" && (
                <span className="pill pill-ghost g-kds-pill-micro">Pend.</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="g-kds-actions">
        <button
          type="button"
          className="g-btn g-btn-ghost g-btn-touch g-kds-action-btn"
          onClick={() => items.forEach((i) => { if (i.status === "pending") onPreparing(i.id); })}
        >
          Preparando
        </button>
        <button
          type="button"
          className="g-btn g-btn-primary g-btn-touch g-kds-action-btn"
          onClick={() => items.forEach((i) => onDispatched(i.id))}
        >
          {late || urgent ? "Acelerar" : "Marcar lista"} →
        </button>
      </div>
    </div>
  );
}

export default function KDS() {
  const { branchId } = useTenantContext();
  const qc = useQueryClient();
  const [station, setStation] = useState(() => localStorage.getItem("kds_station") || "Todas");
  const [soundOn, setSoundOn] = useState(true);
  const [now, setNow] = useState(Date.now());
  const prevIds    = useRef<Set<string>>(new Set());
  const alertLevels = useRef<Record<string, "none" | "yellow" | "red">>({});

  useEffect(() => { localStorage.setItem("kds_station", station); }, [station]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { data: items = [] } = useQuery({
    queryKey: ["kds-items", branchId],
    enabled: !!branchId,
    refetchInterval: 15_000,
    queryFn: async (): Promise<KDSItem[]> => {
      const { data, error } = await supabase
        .from("table_order_items")
        .select(`id, quantity, product_id, product_name, modifiers, status, created_at, notes, order_id,
          products(station),
          table_orders!inner(status, branch_id, tables(name))`)
        .eq("table_orders.branch_id", branchId!)
        .in("table_orders.status", ["open", "sent_to_cashier"])
        .in("status", ["pending", "preparing"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as KDSItem[];
    },
  });

  useEffect(() => {
    if (!branchId) return;
    const ch = supabase.channel("kds-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "table_order_items" },
        () => { qc.invalidateQueries({ queryKey: ["kds-items", branchId] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [branchId, qc]);

  const filtered = useMemo(() =>
    items.filter((i) => station === "Todas" || (i.products?.station ?? "Cocina") === station),
  [items, station]);

  const byOrder = useMemo(() =>
    filtered.reduce((acc: Record<string, KDSItem[]>, item) => {
      (acc[item.order_id] ??= []).push(item);
      return acc;
    }, {}),
  [filtered]);

  // Sound alerts
  useEffect(() => {
    const currentIds = new Set(filtered.map((i) => i.id));
    const isFirst = prevIds.current.size === 0;
    if (!isFirst && soundOn) {
      let hasNew = false;
      for (const id of currentIds) if (!prevIds.current.has(id)) { hasNew = true; break; }
      if (hasNew) { playBeep(); }
      else {
        const orderMins: Record<string, number> = {};
        filtered.forEach((i) => {
          const m = elapsedMinutes(i.created_at);
          if (!orderMins[i.order_id] || m > orderMins[i.order_id]) orderMins[i.order_id] = m;
        });
        let playedWarning = false, playedCritical = false;
        Object.entries(orderMins).forEach(([oid, maxMins]) => {
          const cur = alertLevels.current[oid] || "none";
          if (maxMins >= 20 && cur !== "red") { alertLevels.current[oid] = "red"; playedCritical = true; }
          else if (maxMins >= 10 && maxMins < 20 && cur === "none") { alertLevels.current[oid] = "yellow"; playedWarning = true; }
        });
        if (playedCritical) playCriticalBeep();
        else if (playedWarning) playWarningBeep();
      }
    }
    prevIds.current = currentIds;
  }, [filtered, now, soundOn]);

  const markPreparing = async (itemId: string) => {
    const { error } = await supabase.rpc("start_preparing_table_item", { _item_id: itemId });
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["kds-items", branchId] });
  };

  const markDispatched = async (itemId: string) => {
    const { error } = await supabase.rpc("mark_table_item_ready", { _item_id: itemId });
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["kds-items", branchId] });
  };

  const orderCount = Object.keys(byOrder).length;
  const lateCount  = Object.entries(byOrder).filter(([, orderItems]) => {
    const oldest = orderItems.reduce((a, b) => new Date(a.created_at) < new Date(b.created_at) ? a : b);
    return elapsedMinutes(oldest.created_at) >= SLA_MINUTES;
  }).length;

  return (
    <div className="g-kds-stage">
      {/* Header */}
      <div className="g-kds-header">
        <div className="g-kds-header-info">
          <div className="h-display g-page-title">KDS Cocina</div>
          <div className="h-meta g-page-subtitle">Estación activa · {station}</div>
        </div>

        <div className="glass g-kds-header-stat">
          <span className="dot dot-ok" />
          <div className="g-kds-header-stat-inner">
            <div className="g-kds-header-stat-label">Conectado a POS</div>
            <div className="g-kds-header-stat-val">Tiempo prom. {SLA_MINUTES} min</div>
          </div>
        </div>

        {lateCount > 0 && (
          <div className="glass g-kds-header-stat">
            <span className="dot dot-bad" />
            <div className="g-kds-header-stat-inner">
              <div className="g-kds-header-stat-label">Demoradas</div>
              <div className="g-kds-header-stat-val">{lateCount} orden{lateCount !== 1 ? "es" : ""}</div>
            </div>
          </div>
        )}

        <div className="glass g-kds-header-stat">
          <div className="g-kds-header-stat-inner">
            <div className="g-kds-header-stat-label">En curso</div>
            <div className="h-num g-kds-count-val">{orderCount}</div>
          </div>
        </div>

        <button
          type="button"
          className="g-kds-sound-btn"
          title={soundOn ? "Silenciar alertas" : "Activar alertas"}
          onClick={() => setSoundOn((v) => !v)}
        >
          {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </div>

      {/* Station filter pills */}
      <div className="g-kds-filters">
        {STATIONS.map((s) => (
          <button
            key={s} type="button"
            className={cn("pill pill-md", station === s ? "pill-brand" : "pill-ghost")}
            onClick={() => setStation(s)}
          >
            {s}{s === "Todas" ? ` · ${orderCount}` : ""}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-2 h-meta">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> &lt; 10 min
          <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block ml-2" /> 10–20 min
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block ml-2" /> &gt; 20 min
        </div>
      </div>

      {/* Empty state */}
      {orderCount === 0 && (
        <div className="g-kds-empty">
          <div className="orb g-kds-empty-orb">
            <ChefHat size={32} />
          </div>
          <p className="h-display g-kds-empty-title">Sin órdenes pendientes</p>
          <p className="h-meta">La cocina está al día</p>
        </div>
      )}

      {/* Order cards grid */}
      {orderCount > 0 && (
        <div className="g-kds-grid">
          {Object.entries(byOrder).map(([orderId, orderItems]) => {
            const oldest = orderItems.reduce((a, b) =>
              new Date(a.created_at) < new Date(b.created_at) ? a : b);
            const elapsed = elapsedMinutes(oldest.created_at);
            return (
              <KDSCard
                key={orderId}
                orderId={orderId}
                items={orderItems}
                elapsed={elapsed}
                onPreparing={markPreparing}
                onDispatched={markDispatched}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
