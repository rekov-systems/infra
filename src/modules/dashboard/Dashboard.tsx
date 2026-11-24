import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/format";
import {
  TrendingUp, Wallet, Package, Factory, ShoppingCart,
  BarChart3, Globe, CheckCircle, Cloud, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Sparkline data ── */
const SPARK = [55,62,58,71,68,78,82,76,89,94,88,102,110,105,118,124,121,132,128,140,138,145,152,148,155,150,158];
const YMAX = 200;

/* ── Area chart ── */
function AreaChart() {
  const W = 480, H = 180;
  const pl = 36, pr = 16, pt = 18, pb = 24;
  const iW = W - pl - pr, iH = H - pt - pb;
  const n = SPARK.length;
  const toX = (i: number) => pl + (i / (n - 1)) * iW;
  const toY = (v: number) => pt + (1 - v / YMAX) * iH;
  const linePath = SPARK.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${toX(n-1).toFixed(1)} ${pt+iH} L ${toX(0).toFixed(1)} ${pt+iH} Z`;
  const lX = toX(n-1), lY = toY(SPARK[n-1]);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="g-chart-glow w-full">
      <defs>
        <linearGradient id="aFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2B7CFF" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#2B7CFF" stopOpacity="0.0" />
        </linearGradient>
        <linearGradient id="aLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7FA8FF" />
          <stop offset="100%" stopColor="#1E63E6" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#aFill)" />
      <path d={linePath} fill="none" className="line" stroke="url(#aLine)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {SPARK.map((p, i) => (
        <circle key={i} cx={toX(i)} cy={toY(p)} r={i === n-1 ? 4 : 2.3} fill="#fff" stroke="#2B7CFF" strokeWidth={i === n-1 ? 2.5 : 1.5} />
      ))}
      <g transform={`translate(${lX}, ${lY - 24})`}>
        <rect x="-32" y="-13" width="64" height="20" rx="10" fill="#2B7CFF" />
        <text x="0" y="2" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="var(--g-font-display)">
          ${(SPARK[n-1] * 1000).toLocaleString()}
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
      <circle cx={cx} cy={cy} r={R} stroke="rgba(43,124,255,0.08)" strokeWidth="18" fill="none" />
      {segments.map((s, i) => {
        const dash = (s.value / sum) * C;
        const el = <circle key={i} cx={cx} cy={cy} r={R} stroke={s.color} strokeWidth="18" fill="none"
          strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset} strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`} />;
        offset += dash;
        return el;
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="12" fill="#7986A8" fontFamily="var(--g-font-body)">Total</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="18" fontWeight="800" fill="#0E1F3D" fontFamily="var(--g-font-display)">{total}</text>
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
      const [salesRes, paymentsRes, sessionRes, lowStockRes, prodRes] = await Promise.all([
        supabase.from("sales").select("id,total").eq("branch_id", branchId!).eq("status", "completed").gte("created_at", iso),
        supabase.from("payments").select("method, amount, sales!inner(branch_id, created_at, status)").eq("sales.branch_id", branchId!).eq("sales.status", "completed").gte("sales.created_at", iso),
        supabase.from("cash_sessions").select("id, opening_amount, total_cash, total_in, total_out").eq("branch_id", branchId!).eq("status", "open").maybeSingle(),
        supabase.from("inventory_stocks").select("quantity, products!inner(id, name, min_stock, status, color)").eq("branch_id", branchId!).eq("products.status", "active"),
        supabase.from("production_orders").select("id, produced_quantity").eq("branch_id", branchId!).gte("created_at", iso),
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
      const totalSKUs   = stockItems.length;
      const stockHealth = totalSKUs ? Math.round(((totalSKUs - lowStock.length) / totalSKUs) * 100) : 100;
      const expectedCash = sessionRes.data
        ? Number(sessionRes.data.opening_amount) + Number(sessionRes.data.total_cash) + Number(sessionRes.data.total_in) - Number(sessionRes.data.total_out)
        : 0;
      const productionToday = prodRes.data?.reduce((s, r) => s + Number(r.produced_quantity ?? 0), 0) ?? 0;
      return { salesCount, totalSales, avgTicket, methodsMix, lowStock, lowStockCount: lowStock.length, totalSKUs, stockHealth, expectedCash, cashOpen: !!sessionRes.data, productionToday };
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

  const totalSales = metrics?.totalSales ?? 0;
  const CHANNEL_SEGS: DonutSeg[] = [
    { value: 52, color: "#1E63E6", label: "Tienda Física", amount: formatCurrency(totalSales * 0.52) },
    { value: 24, color: "#5B95FF", label: "Web",           amount: formatCurrency(totalSales * 0.24) },
    { value: 16, color: "#9CC0FF", label: "App Móvil",     amount: formatCurrency(totalSales * 0.16) },
    { value:  8, color: "#FFB54A", label: "Delivery",      amount: formatCurrency(totalSales * 0.08) },
  ];
  const TOP_PRODUCTS = [
    { name: "Capuchino Clásico",     cat: "Bebidas",   qty: 1245, pct: 96 },
    { name: "Croissant Mantequilla", cat: "Panadería", qty: 978,  pct: 78 },
    { name: "Latte Vainilla",        cat: "Bebidas",   qty: 854,  pct: 68 },
    { name: "Cheesecake de Fresa",   cat: "Postres",   qty: 642,  pct: 51 },
    { name: "Pan de Masa Madre",     cat: "Panadería", qty: 523,  pct: 41 },
  ];

  return (
    <div className="flex flex-col gap-4">

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
        <KPICard label="Ventas del día"  value={formatCurrency(metrics?.totalSales ?? 0)} delta="18.5%" sub="vs. ayer"     icon={<TrendingUp size={16} />} />
        <KPICard label="Órdenes activas" value={String(metrics?.salesCount ?? 0)}          delta="12%"   sub="vs. ayer"     icon={<ShoppingCart size={16} />} />
        <KPICard label="Caja actual"     value={formatCurrency(metrics?.expectedCash ?? 0)} sub={metrics?.cashOpen ? "Caja abierta" : "Sin sesión"} icon={<Wallet size={16} />} />
        <KPICard label="Stock saludable" value={`${metrics?.stockHealth ?? 100}%`}          sub="Inventario"               icon={<Package size={16} />} />
        <KPICard label="Producción"      value={String(metrics?.productionToday ?? 0)}      sub="Unidades hoy"             icon={<Factory size={16} />} />
        <KPICard label="Canales activos" value="4 / 5"                                       sub="80% en línea"             icon={<Globe size={16} />} />
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
            <AreaChart />
          </div>
          <div className="flex items-end justify-between gap-2.5">
            <div>
              <div className="g-num-26">{formatCurrency(metrics?.totalSales ?? 0)}</div>
              <div className="h-meta">Total del día</div>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 font-bold text-[14px] text-g-ok">
                <ArrowUpRight size={12} /> 18.5%
              </span>
              <div className="h-meta">vs. mes anterior</div>
            </div>
          </div>
        </div>

        {/* Top products */}
        <div className="glass flex flex-col gap-3.5 g-panel-20">
          <div className="flex items-center justify-between">
            <div className="g-title-16">Top productos</div>
            <span className="g-pill g-pill-ghost g-pill-h28">Este mes</span>
          </div>
          <div className="flex flex-col gap-3 flex-1">
            {TOP_PRODUCTS.map((r, i) => (
              <BarRow key={i} label={r.name} sub={r.cat} pct={r.pct} value={r.qty.toLocaleString()} />
            ))}
          </div>
          <Link to="/products" className="g-link justify-between">
            Ver todos los productos <ArrowUpRight size={12} />
          </Link>
        </div>

        {/* Channel donut */}
        <div className="glass flex flex-col gap-3.5 g-panel-20">
          <div className="flex items-center justify-between">
            <div className="g-title-16">Canal de ventas</div>
            <span className="g-pill g-pill-ghost g-pill-h28">Este mes</span>
          </div>
          <div className="flex items-center gap-4 flex-1">
            <Donut size={160} segments={CHANNEL_SEGS} total={formatCurrency(totalSales)} />
            <div className="flex flex-col gap-2.5 flex-1 min-w-0">
              {CHANNEL_SEGS.map((s, i) => (
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
              <div className="g-num-20">{metrics?.totalSKUs ?? 1248}</div>
            </div>
            <div>
              <div className="h-meta mb-1">Bajo stock</div>
              <div className="g-num-20 text-g-warn">{metrics?.lowStockCount ?? 0}</div>
            </div>
            <div>
              <div className="h-meta mb-1">Sin stock</div>
              <div className="g-num-20 text-g-bad">12</div>
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
        POS-S360T © 2026 — POS S360T Contributors · Apache 2.0
      </p>
    </div>
  );
}
