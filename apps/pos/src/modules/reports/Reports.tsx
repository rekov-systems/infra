import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatCurrency } from "@/lib/format";
import { TrendingUp, Receipt, ShoppingBag, Package, Download, Calendar } from "lucide-react";
import { toast } from "sonner";

export default function Reports() {
  const { branchId } = useTenantContext();
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ["reports-advanced", branchId, dateFrom, dateTo],
    enabled: !!branchId,
    queryFn: async () => {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);

      const [salesRes, itemsRes, paymentsRes] = await Promise.all([
        supabase.from("sales").select("id, total, tax_total, created_at, channel").eq("branch_id", branchId!)
          .eq("status", "completed").gte("created_at", from.toISOString()).lte("created_at", to.toISOString()),
        supabase.from("sale_items").select("product_name, quantity, line_total, sales!inner(branch_id, created_at, status)")
          .eq("sales.branch_id", branchId!).eq("sales.status", "completed").gte("sales.created_at", from.toISOString()).lte("sales.created_at", to.toISOString()),
        supabase.from("payments").select("method, amount, sales!inner(branch_id, created_at, status)")
          .eq("sales.branch_id", branchId!).eq("sales.status", "completed").gte("sales.created_at", from.toISOString()).lte("sales.created_at", to.toISOString()),
      ]);

      const sales = salesRes.data ?? [];
      const items = itemsRes.data ?? [];
      const payments = paymentsRes.data ?? [];

      const byDay: Record<string, { date: string; total: number; tickets: number }> = {};
      sales.forEach((s) => {
        const d = new Date(s.created_at).toISOString().slice(0, 10);
        if (!byDay[d]) byDay[d] = { date: d, total: 0, tickets: 0 };
        byDay[d].total += Number(s.total);
        byDay[d].tickets += 1;
      });
      const days = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

      const byProduct: Record<string, { name: string; qty: number; total: number }> = {};
      items.forEach((it: any) => {
        if (!byProduct[it.product_name]) byProduct[it.product_name] = { name: it.product_name, qty: 0, total: 0 };
        byProduct[it.product_name].qty += Number(it.quantity);
        byProduct[it.product_name].total += Number(it.line_total);
      });
      const top = Object.values(byProduct).sort((a, b) => b.total - a.total).slice(0, 20);

      const byMethod: Record<string, number> = {};
      payments.forEach((p: any) => { byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount); });

      const totals = sales.reduce((s, r) => s + Number(r.total), 0);
      const taxTotal = sales.reduce((s, r) => s + Number(r.tax_total || 0), 0);

      return { days, top, byMethod, totals, taxTotal, count: sales.length, avg: sales.length ? totals / sales.length : 0 };
    },
  });

  const exportCSV = (type: 'days' | 'products') => {
    if (!data) return;
    let csv = "";
    let filename = "";

    if (type === 'days') {
      csv = "Fecha,Tickets,Total\n" + data.days.map(d => `${d.date},${d.tickets},${d.total}`).join("\n");
      filename = `reporte_ventas_${dateFrom}_a_${dateTo}.csv`;
    } else {
      csv = "Producto,Cantidad,Total\n" + data.top.map(p => `${p.name},${p.qty},${p.total}`).join("\n");
      filename = `reporte_productos_${dateFrom}_a_${dateTo}.csv`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Archivo exportado correctamente");
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="SISTEMA · ANALYTICS"
        title="Reportes Avanzados"
        description="Analiza el rendimiento de tu negocio con filtros personalizados"
        actions={
          <div className="flex items-center gap-2 glass rounded-xl px-3 py-1.5">
            <Calendar className="h-4 w-4 text-ink-500" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-36 border-0 bg-transparent focus-visible:ring-0 text-sm"
            />
            <span className="h-meta">→</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-36 border-0 bg-transparent focus-visible:ring-0 text-sm"
            />
          </div>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {[
          { icon: <TrendingUp size={16} />, label: "Ventas Totales", value: formatCurrency(data?.totals ?? 0), accent: true },
          { icon: <Receipt size={16} />,    label: "Total Tickets",   value: String(data?.count ?? 0) },
          { icon: <ShoppingBag size={16} />,label: "Ticket Promedio", value: formatCurrency(data?.avg ?? 0) },
          { icon: <Package size={16} />,    label: "Impuestos (IVA)", value: formatCurrency(data?.taxTotal ?? 0) },
        ].map(({ icon, label, value, accent }) => (
          <div key={label} className={`glass flex flex-col g-kpi${accent ? " border-l-2 border-brand-600" : ""}`}>
            <div className="flex items-center justify-between gap-2.5">
              <div className="h-label">{label}</div>
              <div className="orb g-orb-36">{icon}</div>
            </div>
            <div className="h-num g-val-24 mt-2">{value}</div>
          </div>
        ))}
      </div>

      {/* Tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ventas por día */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--hairline)]">
            <div className="flex items-center gap-2.5">
              <div className="orb g-orb-32"><TrendingUp size={14} /></div>
              <div>
                <div className="h-meta uppercase tracking-wider">PERÍODO SELECCIONADO</div>
                <div className="h-label font-semibold text-ink-900 text-sm">Ventas por día</div>
              </div>
            </div>
            <button
              type="button"
              className="g-btn g-btn-ghost g-btn-sm"
              onClick={() => exportCSV('days')}
              disabled={!data?.days.length}
            >
              <Download size={13} className="mr-1" /> Exportar
            </button>
          </div>
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_110px] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500 border-b border-[var(--hairline)]">
            <div>Fecha</div>
            <div className="text-right">Tickets</div>
            <div className="text-right">Total</div>
          </div>
          <div className="divide-y divide-[var(--hairline)]">
            {(data?.days ?? []).map((d) => (
              <div key={d.date} className="grid grid-cols-[1fr_80px_110px] items-center px-5 py-3 text-sm hover:bg-white/5 transition-colors">
                <div className="font-medium text-ink-900">
                  {new Date(d.date).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })}
                </div>
                <div className="text-right tabular-nums text-ink-500">{d.tickets}</div>
                <div className="text-right tabular-nums font-bold text-ink-900">{formatCurrency(d.total)}</div>
              </div>
            ))}
            {(!data?.days || data.days.length === 0) && (
              <div className="px-5 py-10 text-center h-meta italic">
                {isLoading ? "Cargando…" : "Sin movimientos en este periodo"}
              </div>
            )}
          </div>
        </div>

        {/* Productos más vendidos */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--hairline)]">
            <div className="flex items-center gap-2.5">
              <div className="orb g-orb-32"><Package size={14} /></div>
              <div>
                <div className="h-meta uppercase tracking-wider">RANKING</div>
                <div className="h-label font-semibold text-ink-900 text-sm">Productos más vendidos</div>
              </div>
            </div>
            <button
              type="button"
              className="g-btn g-btn-ghost g-btn-sm"
              onClick={() => exportCSV('products')}
              disabled={!data?.top.length}
            >
              <Download size={13} className="mr-1" /> Exportar
            </button>
          </div>
          <div className="grid grid-cols-[1fr_80px_110px] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500 border-b border-[var(--hairline)]">
            <div>Producto</div>
            <div className="text-right">Unidades</div>
            <div className="text-right">Total</div>
          </div>
          <div className="divide-y divide-[var(--hairline)]">
            {(data?.top ?? []).map((p) => (
              <div key={p.name} className="grid grid-cols-[1fr_80px_110px] items-center px-5 py-3 text-sm hover:bg-white/5 transition-colors">
                <div className="font-medium text-ink-900 truncate">{p.name}</div>
                <div className="text-right tabular-nums text-ink-500 font-bold">{p.qty.toFixed(0)}</div>
                <div className="text-right tabular-nums font-bold text-brand-600">{formatCurrency(p.total)}</div>
              </div>
            ))}
            {(!data?.top || data.top.length === 0) && (
              <div className="px-5 py-10 text-center h-meta italic">
                {isLoading ? "Cargando…" : "Sin productos vendidos"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Medios de pago */}
        <div className="glass rounded-2xl p-5">
          <div className="h-meta uppercase tracking-wider mb-4">MIX · MEDIOS DE PAGO</div>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(data?.byMethod ?? {}).map(([m, total]) => (
              <div key={m} className="glass-thin rounded-xl p-3">
                <div className="h-meta uppercase tracking-wider mb-1">{m}</div>
                <div className="h-num g-val-18">{formatCurrency(total)}</div>
              </div>
            ))}
            {Object.keys(data?.byMethod ?? {}).length === 0 && (
              <div className="col-span-full text-center h-meta py-6">Sin pagos registrados</div>
            )}
          </div>
        </div>

        {/* Resumen impositivo */}
        <div className="glass rounded-2xl p-5 relative overflow-hidden">
          <div className="h-meta uppercase tracking-wider mb-4">RESUMEN IMPOSITIVO</div>
          <div className="space-y-4">
            {[
              { label: "Subtotal neto", value: formatCurrency((data?.totals ?? 0) - (data?.taxTotal ?? 0)) },
              { label: "Impuestos IVA", value: formatCurrency(data?.taxTotal ?? 0) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-baseline">
                <span className="h-label">{label}</span>
                <span className="h-num g-val-22 tabular-nums">{value}</span>
              </div>
            ))}
            <div className="flex justify-between items-baseline pt-2 border-t border-[var(--hairline)]">
              <span className="h-label font-semibold">Total Bruto</span>
              <span className="h-num g-val-28 tabular-nums">{formatCurrency(data?.totals ?? 0)}</span>
            </div>
          </div>
          <div className="absolute bottom-4 right-4 opacity-5 pointer-events-none">
            <TrendingUp className="h-28 w-28" />
          </div>
        </div>
      </div>
    </div>
  );
}
