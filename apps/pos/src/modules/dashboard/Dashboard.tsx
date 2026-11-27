import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/format";
import {
  TrendingUp, Wallet, Package, ShoppingCart,
  BarChart3, CheckCircle, Cloud, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Sparkline data ── */
/* ── Area chart ── */
function AreaChart({ values }: { values: number[] }) {
  const W = 480, H = 180;
  const pl = 36, pr = 16, pt = 18, pb = 24;
  const iW = W - pl - pr, iH = H - pt - pb;
  const points = values.length ? values : [0, 0, 0, 0, 0, 0, 0];
  const n = points.length;
  const ymax = Math.max(...points, 1) * 1.15;
  const toX = (i: number) => pl + (i / (n - 1)) * iW;
  const toY = (v: number) => pt + (1 - v / ymax) * iH;
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${toX(n-1).toFixed(1)} ${pt+iH} L ${toX(0).toFixed(1)} ${pt+iH} Z`;
  const lX = toX(n-1), lY = toY(points[n-1]);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="g-chart-glow w-full">
      <defs>
        <linearGradient id="aFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff5a1f" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#ff5a1f" stopOpacity="0.0" />
        </linearGradient>
        <linearGradient id="aLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff8a45" />
          <stop offset="100%" stopColor="#e04a12" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#aFill)" />
      <path d={linePath} fill="none" className="line" stroke="url(#aLine)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={toX(i)} cy={toY(p)} r={i === n-1 ? 4 : 2.3} fill="#fff" stroke="#ff5a1f" strokeWidth={i === n-1 ? 2.5 : 1.5} />
      ))}
      <g transform={`translate(${lX}, ${lY - 24})`}>
        <rect x="-32" y="-13" width="64" height="20" rx="10" fill="#ff5a1f" />
        <text x="0" y="2" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="var(--g-font-display)">
          {formatCurrency(points[n-1])}
        </text>
      </g>
    </svg>
  );
}

/* ── Donut ── */
interface DonutSeg { value: number; color: string; label: string; amount: string }
function Donut({ size = 160, segments, total }: { size?: number; segments: DonutSeg[]; total: string }) {
  const R = size/2 - 14, C = 2 * Math.PI * R;
  const sum = segments.reduce((a, b) => a + b.value, 0);
  const cx = size/2, cy = size/2;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={R} stroke="rgba(255,90,31,0.08)" strokeWidth="18" fill="none" />
      {segments.map((s, i) => {
        const dash = (s.value / sum) * C;
        const el = <circle key={i} cx={cx} cy={cy} r={R} stroke={s.color} strokeWidth="18" fill="none"
          strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset} strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`} />;
        offset += dash;
        return el;
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="12" fill="#939397" fontFamily="var(--g-font-body)">Total</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="18" fontWeight="800" fill="#171717" fontFamily="var(--g-font-display)">{total}</text>
    </svg>
  );
}

/* ── Bar row ── */
function BarRow({ label, sub, pct, value }: { label: string; sub: string; pct: number; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-[13px] font-semibold text-ink-900">{label}</span>
        <span className="g-num-14">{value}</span>
      </div>
      <div className="g-bar"><i ref={(el) => { if (el) el.style.width = `${pct}%`; }} /></div>
      <span className="h-meta">{sub}</span>
    </div>
  );
}

/* ── KPI card ── */
interface KPIProps { label: string; value: string; delta?: string; deltaUp?: boolean; sub?: string; icon: React.ReactNode; compact?: boolean }
function KPICard({ label, value, delta, deltaUp = true, sub, icon, compact = false }: KPIProps) {
  return (
    <div className={cn("glass flex flex-col", compact ? "g-kpi g-kpi-compact" : "g-kpi")}>
      <div className="flex items-center justify-between gap-2.5">
        <div className={cn("h-label", compact ? "g-val-11" : "g-val-12")}>{label}</div>
        <div className={cn("orb", compact ? "g-orb-30" : "g-orb-38")}>{icon}</div>
      </div>
      <div className={cn("h-num", compact ? "g-val-22" : "g-val-28")}>{value}</div>
      {(delta || sub) && (
        <div className="flex items-center gap-2 flex-wrap">
          {delta && (
            <span className={cn("inline-flex items-center gap-1 text-[12px] font-bold", deltaUp ? "text-g-ok" : "text-g-bad")}>
              {deltaUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              {delta}
            </span>
          )}
          {sub && <span className="h-meta">{sub}</span>}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { tenantId, branchId, branches } = useTenantContext();
  const branchName = branches.find((b) => b.id === branchId)?.name ?? "—";

  const { data: metrics } = useQuery({
    queryKey: ["dashboard-metrics", tenantId, branchId],
    enabled: !!tenantId && !!branchId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const iso = today.toISOString();
      const week = new Date(today); week.setDate(week.getDate() - 6);
      const [salesRes, trendRes, paymentsRes, sessionRes, lowStockRes] = await Promise.all([
        supabase.from("sales").select("id,total").eq("branch_id", branchId!).eq("status", "completed").gte("created_at", iso),
        supabase.from("sales").select("total,created_at").eq("branch_id", branchId!).eq("status", "completed").gte("created_at", week.toISOString()),
        supabase.from("payments").select("method, amount, sales!inner(branch_id, created_at, status)").eq("sales.branch_id", branchId!).eq("sales.status", "completed").gte("sales.created_at", iso),
        supabase.from("cash_sessions").select("id, opening_amount, total_cash, total_in, total_out").eq("branch_id", branchId!).eq("status", "open"),
        supabase.from("inventory_stocks").select("quantity, products!inner(id, name, min_stock, status, color)").eq("branch_id", branchId!).eq("products.status", "active"),
      ]);
      const salesCount  = salesRes.data?.length ?? 0;
      const totalSales  = salesRes.data?.reduce((s, r) => s + Number(r.total), 0) ?? 0;
      const avgTicket   = salesCount ? totalSales / salesCount : 0;
      const byMethod: Record<string, number> = {};
      paymentsRes.data?.forEach((p: any) => { byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount); });
      const methodTotal = Object.values(byMethod).reduce((a, b) => a + b, 0);
      const methodsMix  = Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([method, amount]) => ({ method, amount, pct: methodTotal ? Math.round((amount / methodTotal) * 100) : 0 }));
      const stockItems  = lowStockRes.data ?? [];
      const lowStock    = stockItems.filter((r: any) => Number(r.quantity) <= Number(r.products.min_stock || 0));
      const outOfStockCount = stockItems.filter((r: any) => Number(r.quantity) <= 0).length;
      const trendByDay = new Map<string, number>();
      for (let i = 0; i < 7; i++) {
        const day = new Date(week); day.setDate(week.getDate() + i);
        trendByDay.set(day.toISOString().slice(0, 10), 0);
      }
      trendRes.data?.forEach((sale) => {
        const key = new Date(sale.created_at).toISOString().slice(0, 10);
        trendByDay.set(key, (trendByDay.get(key) ?? 0) + Number(sale.total));
      });
      const totalSKUs   = stockItems.length;
      const stockHealth = totalSKUs ? Math.round(((totalSKUs - lowStock.length) / totalSKUs) * 100) : 100;
      const openSessions = sessionRes.data ?? [];
      const expectedCash = openSessions.reduce((sum, session) => sum + Number(session.opening_amount) + Number(session.total_cash) + Number(session.total_in) - Number(session.total_out), 0);
      return { salesCount, totalSales, avgTicket, methodsMix, lowStock, lowStockCount: lowStock.length, outOfStockCount, totalSKUs, stockHealth, expectedCash, cashOpen: openSessions.length > 0, salesTrend: [...trendByDay.values()] };
    },
  });

  const { data: recentSales } = useQuery({
    queryKey: ["dashboard-feed", branchId],
    enabled: !!branchId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase.from("sales")
        .select("id, ticket_number, total, created_at, channel, payments(method, amount)")
        .eq("branch_id", branchId!).eq("status", "completed")
        .order("created_at", { ascending: false }).limit(5);
      return (data ?? []) as any[];
    },
  });

  const paymentColors = ["#ff5a1f", "#171717", "#777b83", "#ff8a45"];
  const paymentLabels: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", other: "Otro" };
  const paymentSegs: DonutSeg[] = (metrics?.methodsMix ?? []).map((m, i) => ({
    value: m.pct, color: paymentColors[i % paymentColors.length],
    label: paymentLabels[m.method] ?? m.method, amount: formatCurrency(m.amount),
  }));

  return (
    <div className="flex flex-col gap-4">

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <KPICard label="Ventas del día"  value={formatCurrency(metrics?.totalSales ?? 0)} sub="Total confirmado" icon={<TrendingUp size={16} />} />
        <KPICard label="Tickets" value={String(metrics?.salesCount ?? 0)} sub="Ventas completadas" icon={<ShoppingCart size={16} />} />
        <KPICard label="Caja actual"     value={formatCurrency(metrics?.expectedCash ?? 0)} sub={metrics?.cashOpen ? "Caja abierta" : "Sin sesión"} icon={<Wallet size={16} />} />
        <KPICard label="Stock saludable" value={`${metrics?.stockHealth ?? 100}%`}          sub="Inventario"               icon={<Package size={16} />} />
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr_1fr] gap-3.5 min-h-[300px]">

        {/* Sales chart */}
        <div className="glass flex flex-col gap-3.5 g-panel-20">
          <div className="flex items-center justify-between">
            <div>
              <div className="g-title-16">Resumen de ventas</div>
              <div className="h-meta">Tendencia mensual · {branchName}</div>
            </div>
            <span className="g-pill g-pill-ghost g-pill-h28">Este mes <TrendingUp size={12} /></span>
          </div>
          <div className="flex-1 flex items-center justify-center min-w-0 overflow-hidden">
            <AreaChart values={metrics?.salesTrend ?? []} />
          </div>
          <div className="flex items-end justify-between gap-2.5">
            <div>
              <div className="g-num-26">{formatCurrency(metrics?.totalSales ?? 0)}</div>
              <div className="h-meta">Total del día</div>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 font-bold text-[14px] text-ink-700">
                {metrics?.salesCount ?? 0} tickets
              </span>
              <div className="h-meta">hoy</div>
            </div>
          </div>
        </div>

        {/* Critical stock */}
        <div className="glass flex flex-col gap-3.5 g-panel-20">
          <div className="flex items-center justify-between">
            <div className="g-title-16">Existencias críticas</div>
            <span className="g-pill g-pill-ghost g-pill-h28">{metrics?.lowStockCount ?? 0}</span>
          </div>
          <div className="flex flex-col gap-3 flex-1">
            {(metrics?.lowStock ?? []).slice(0, 5).map((row: any, i: number) => (
              <BarRow key={row.products.id ?? i} label={row.products.name} sub="Stock bajo" pct={Math.max(0, Math.min(100, Number(row.quantity) / Math.max(1, Number(row.products.min_stock)) * 100))} value={String(row.quantity)} />
            ))}
            {(metrics?.lowStock ?? []).length === 0 && <p className="h-meta text-center py-4">No hay productos por debajo del mínimo</p>}
          </div>
          <Link to="/products" className="g-link justify-between">
            Ver todos los productos <ArrowUpRight size={12} />
          </Link>
        </div>

        {/* Payment mix */}
        <div className="glass flex flex-col gap-3.5 g-panel-20">
          <div className="flex items-center justify-between">
            <div className="g-title-16">Medios de pago</div>
            <span className="g-pill g-pill-ghost g-pill-h28">Hoy</span>
          </div>
          <div className="flex items-center gap-4 flex-1">
            {paymentSegs.length ? <Donut size={160} segments={paymentSegs} total={formatCurrency(metrics?.totalSales ?? 0)} /> : <p className="h-meta">Aún no hay pagos registrados hoy.</p>}
            <div className="flex flex-col gap-2.5 flex-1 min-w-0">
              {paymentSegs.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="g-dot-color" ref={(el) => { if (el) el.style.background = s.color; }} />
                    <span className="text-[13px] font-semibold text-ink-900 truncate">{s.label}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="g-num-13">{s.value}%</div>
                    <div className="h-meta g-val-10">{s.amount}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Link to="/reports" className="g-link justify-between">
            Ver detalle <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">

        {/* Inventory */}
        <div className="glass flex flex-col gap-3.5 g-panel">
          <div className="flex justify-between items-center">
            <div className="g-title-15">Inventario</div>
            <Link to="/inventory" className="g-link g-val-12">Ver todo</Link>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <div className="h-meta mb-1">Total SKUs</div>
              <div className="g-num-20">{metrics?.totalSKUs ?? 0}</div>
            </div>
            <div>
              <div className="h-meta mb-1">Bajo stock</div>
              <div className="g-num-20 text-g-warn">{metrics?.lowStockCount ?? 0}</div>
            </div>
            <div>
              <div className="h-meta mb-1">Sin stock</div>
              <div className="g-num-20 text-g-bad">{metrics?.outOfStockCount ?? 0}</div>
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="h-meta">Salud del inventario</span>
              <span className="text-[12px] font-bold text-g-ok">{metrics?.stockHealth ?? 100}%</span>
            </div>
            <div className="g-bar">
              <i ref={(el) => { if (el) el.style.width = `${metrics?.stockHealth ?? 100}%`; }} />
            </div>
          </div>
        </div>

        {/* Payments */}
        <div className="glass flex flex-col gap-3 g-panel">
          <div className="flex justify-between items-center">
            <div className="g-title-15">Pagos</div>
            <Link to="/sales" className="g-link g-val-12">Ver todos</Link>
          </div>
          <div className="flex flex-col gap-2">
            {(metrics?.methodsMix ?? []).slice(0, 4).map((m, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Wallet size={16} className="text-ink-500" />
                  <span className="text-[13px] font-semibold text-ink-900">{m.method}</span>
                </div>
                <span className="g-num-13">{formatCurrency(m.amount)}</span>
              </div>
            ))}
            {(metrics?.methodsMix ?? []).length === 0 && (
              <p className="h-meta text-center py-2">Sin pagos hoy</p>
            )}
          </div>
          <div className="g-hairline" />
          <div className="flex justify-between items-center">
            <span className="text-[14px] font-bold text-ink-900">Total</span>
            <span className="g-num-18">{formatCurrency(metrics?.totalSales ?? 0)}</span>
          </div>
        </div>

        {/* Live feed */}
        <div className="glass flex flex-col gap-3 g-panel">
          <div className="flex justify-between items-center">
            <div className="g-title-15">Ventas recientes</div>
            <span className="g-pill g-pill-ok g-pill-h22">
              <span className="g-dot g-dot-ok" /> Live
            </span>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            {(recentSales ?? []).length === 0 ? (
              <p className="h-meta text-center py-4">Sin ventas aún hoy</p>
            ) : (recentSales ?? []).slice(0, 4).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="g-dot g-dot-brand" />
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-ink-900 truncate">#{s.ticket_number ?? s.id.slice(0, 6)}</div>
                    <div className="h-meta g-val-10">
                      {new Date(s.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
                <span className="g-num-13 shrink-0">{formatCurrency(Number(s.total))}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Branches */}
        <div className="glass flex flex-col gap-3 g-panel">
          <div className="flex justify-between items-center">
            <div className="g-title-15">Sucursales</div>
            <Link to="/branches" className="g-link g-val-12">Ver todas</Link>
          </div>
          <div className="flex flex-col gap-2">
            {branches.slice(0, 4).map((b, i) => (
              <div key={b.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <BarChart3 size={16} className="text-ink-500 shrink-0" />
                  <span className="text-[13px] font-semibold text-ink-900 truncate max-w-[100px]">{b.name}</span>
                </div>
                <span className={cn("g-pill g-pill-h18", i === 0 ? "g-pill-ok" : "g-pill-ghost")}>
                  {i === 0 ? "En línea" : "Activa"}
                </span>
              </div>
            ))}
            {branches.length === 0 && <p className="h-meta text-center py-4">Sin sucursales</p>}
          </div>
        </div>

        {/* Sync */}
        <div className="glass flex flex-col gap-3 g-panel items-center text-center">
          <div className="flex justify-between items-center w-full">
            <div className="g-title-15">Sincronización</div>
          </div>
          <div className="orb g-orb-64 g-sync-orb-wrap">
            <Cloud size={28} />
          </div>
          <div>
            <div className="font-bold g-val-14 text-g-ok flex items-center justify-center gap-1">
              <CheckCircle size={14} /> Todo sincronizado
            </div>
            <div className="h-meta mt-1">Última: hace &lt; 1 min</div>
          </div>
          <button type="button" className="g-btn g-btn-ghost g-val-12 w-full h-8">
            Ver historial <ArrowUpRight size={12} />
          </button>
        </div>
      </div>

      <p className="g-footer-note">
        Desk © 2026 — Rekov Systems · Software de código abierto
      </p>
    </div>
  );
}
