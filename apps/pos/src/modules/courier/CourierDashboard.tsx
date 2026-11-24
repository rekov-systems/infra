import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { Phone, MapPin, Bike, CheckCircle2, Navigation, CreditCard, Banknote, Smartphone, QrCode, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type DeliveryStatus = Database["public"]["Enums"]["delivery_status"];
type PayMethod = "cash" | "card" | "transfer" | "qr";

const STATUS_META: Record<DeliveryStatus, { label: string; pillClass: string }> = {
  received:   { label: "Recibido",          pillClass: "g-pill-ghost" },
  preparing:  { label: "Preparando",        pillClass: "g-pill-warn" },
  ready:      { label: "Listo para recoger",pillClass: "g-pill-sky" },
  assigned:   { label: "Asignado a mí",     pillClass: "g-pill-brand" },
  on_way:     { label: "En camino",         pillClass: "g-pill-brand" },
  delivered:  { label: "Entregado",         pillClass: "g-pill-ok" },
  cancelled:  { label: "Cancelado",         pillClass: "g-pill-bad" },
};

const PAY_METHODS: { id: PayMethod; label: string; icon: any }[] = [
  { id: "cash",     label: "Efectivo",      icon: Banknote },
  { id: "card",     label: "Datáfono",      icon: CreditCard },
  { id: "transfer", label: "Transferencia", icon: Smartphone },
  { id: "qr",       label: "QR",            icon: QrCode },
];

export default function CourierDashboard() {
  const { tenantId, branchId, branches, roles } = useTenantContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const branchName = branches.find((b) => b.id === branchId)?.name ?? "—";
  const isSuperAdmin = roles.includes("super_admin");

  const [payOrder, setPayOrder] = useState<any | null>(null);
  const [method, setMethod] = useState<PayMethod>("cash");
  const [submitting, setSubmitting] = useState(false);

  // Buscar el employee_id del courier basado en el user_id
  const { data: employee } = useQuery({
    queryKey: ["courier-employee", user?.id, tenantId],
    enabled: !!user && !!tenantId && !isSuperAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("tenant_id", tenantId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ["courier-orders", branchId, employee?.id, isSuperAdmin],
    enabled: !!branchId && (isSuperAdmin || !!employee?.id),
    refetchInterval: 15000,
    queryFn: async () => {
      let q = supabase
        .from("delivery_orders")
        .select("*, sales(total)")
        .eq("branch_id", branchId!)
        .order("created_at", { ascending: false })
        .limit(100);
      // Super admin sees all orders; courier sees only their own
      if (!isSuperAdmin && employee?.id) {
        q = q.eq("courier_id", employee.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const active = (orders ?? []).filter((o: any) => !["delivered", "cancelled"].includes(o.status));
    const done   = (orders ?? []).filter((o: any) => ["delivered", "cancelled"].includes(o.status));
    return { active, done };
  }, [orders]);

  if (!user || !tenantId || !branchId) {
    return <div className="p-6 h-meta">Cargando...</div>;
  }

  if (!isSuperAdmin && !employee) {
    return (
      <div className="p-6">
        <div className="glass rounded-2xl p-8 text-center h-meta">
          Tu usuario no está vinculado a un empleado en esta sucursal. Pide al administrador que te registre como domiciliario.
        </div>
      </div>
    );
  }

  const updateStatus = async (id: string, status: DeliveryStatus) => {
    const { error } = await supabase.rpc("update_delivery_status", {
      _order_id: id, _status: status, _courier_id: null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Estado: ${STATUS_META[status].label}`);
    qc.invalidateQueries({ queryKey: ["courier-orders"] });
  };

  const openMaps = (address: string, neighborhood?: string | null) => {
    const q = encodeURIComponent([address, neighborhood].filter(Boolean).join(", "));
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
  };

  const openPay = (o: any) => {
    setPayOrder(o);
    setMethod("cash");
  };

  const confirmPayment = async () => {
    if (!payOrder) return;
    const amount = Number(payOrder.sales?.total ?? 0) + Number(payOrder.delivery_fee ?? 0);
    if (amount <= 0) return toast.error("Monto inválido");
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("register_delivery_payment", {
        _order_id: payOrder.id,
        _method: method,
        _amount: amount,
        _reference: null,
      });
      if (error) throw error;
      // Marcar como entregado
      await supabase.rpc("update_delivery_status", {
        _order_id: payOrder.id, _status: "delivered" as DeliveryStatus, _courier_id: null,
      });
      toast.success(`Cobro registrado · ${formatCurrency(amount)}`);
      setPayOrder(null);
      qc.invalidateQueries({ queryKey: ["courier-orders"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderCard = (o: any) => {
    const meta  = STATUS_META[o.status as DeliveryStatus];
    const total = Number(o.sales?.total ?? 0) + Number(o.delivery_fee ?? 0);
    return (
      <div key={o.id} className="glass rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold leading-tight truncate text-[var(--ink-900)]">{o.customer_name || "Sin nombre"}</div>
            <div className="h-meta">{formatDate(o.created_at)}</div>
          </div>
          <span className={cn("g-pill g-pill-h22 whitespace-nowrap", meta.pillClass)}>{meta.label}</span>
        </div>

        <div className="text-sm space-y-1">
          {o.customer_phone && (
            <a href={`tel:${o.customer_phone}`} className="flex items-center gap-1.5 text-[var(--brand-600)] hover:underline">
              <Phone className="h-3.5 w-3.5" /> {o.customer_phone}
            </a>
          )}
          <button
            type="button"
            onClick={() => openMaps(o.address, o.neighborhood)}
            className="flex items-start gap-1.5 text-left hover:text-[var(--brand-600)] w-full text-[var(--ink-700)]"
          >
            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span className="flex-1">{o.address}{o.neighborhood ? ` · ${o.neighborhood}` : ""}</span>
            <Navigation className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--g-hairline)] pt-2">
          <span className="h-label">Total a cobrar</span>
          <span className="h-num text-lg text-[var(--brand-600)]">{formatCurrency(total)}</span>
        </div>

        {o.status === "assigned" && (
          <button type="button" className="g-btn g-btn-primary w-full" onClick={() => updateStatus(o.id, "on_way")}>
            <Bike className="h-3.5 w-3.5 mr-1" /> Salir / En camino
          </button>
        )}
        {o.status === "on_way" && (
          <button type="button" className="g-btn g-btn-primary w-full" onClick={() => openPay(o)}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Cobrar y entregar
          </button>
        )}
        {o.status === "ready" && (
          <button type="button" className="g-btn g-btn-ghost w-full" onClick={() => updateStatus(o.id, "on_way")}>
            <Bike className="h-3.5 w-3.5 mr-1" /> Recoger y salir
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="OPERACIÓN · DOMICILIOS"
        title="Panel del domiciliario"
        description={`${employee?.full_name ?? (isSuperAdmin ? "Super Admin" : "—")} · ${branchName}`}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass g-kpi">
          <div className="h-label uppercase tracking-wider">Activos</div>
          <div className="h-num text-2xl text-[var(--brand-600)]">{grouped.active.length}</div>
        </div>
        <div className="glass g-kpi">
          <div className="h-label uppercase tracking-wider">En camino</div>
          <div className="h-num text-2xl">{grouped.active.filter((o: any) => o.status === "on_way").length}</div>
        </div>
        <div className="glass g-kpi">
          <div className="h-label uppercase tracking-wider">Entregados hoy</div>
          <div className="h-num text-2xl text-[var(--g-ok)]">
            {grouped.done.filter((o: any) => {
              const d = new Date(o.delivered_at ?? o.updated_at);
              const t = new Date();
              return o.status === "delivered" && d.toDateString() === t.toDateString();
            }).length}
          </div>
        </div>
        <div className="glass g-kpi">
          <div className="h-label uppercase tracking-wider">Total a cobrar</div>
          <div className="h-num text-2xl tabular-nums">
            {formatCurrency(grouped.active.reduce((s: number, o: any) =>
              s + Number(o.sales?.total ?? 0) + Number(o.delivery_fee ?? 0), 0))}
          </div>
        </div>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Activos ({grouped.active.length})</TabsTrigger>
          <TabsTrigger value="done">Historial ({grouped.done.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {isLoading ? (
            <div className="h-meta">Cargando…</div>
          ) : grouped.active.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center h-meta">
              No tienes pedidos asignados.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped.active.map(renderCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="done" className="mt-4">
          {grouped.done.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center h-meta">Sin historial.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped.done.map(renderCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Payment dialog */}
      <Dialog open={!!payOrder} onOpenChange={(o) => !o && setPayOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="h-display text-lg">Cobrar y entregar</DialogTitle>
          </DialogHeader>
          {payOrder && (
            <div className="space-y-4">
              <div className="glass rounded-xl p-3 space-y-0.5">
                <div className="h-label">Cliente</div>
                <div className="font-semibold text-[var(--ink-900)]">{payOrder.customer_name}</div>
                <div className="h-meta">{payOrder.address}</div>
              </div>
              <div className="flex items-baseline justify-between border-t border-b border-[var(--g-hairline)] py-3">
                <span className="h-label">Total recibido</span>
                <span className="h-num text-3xl text-[var(--brand-600)]">
                  {formatCurrency(Number(payOrder.sales?.total ?? 0) + Number(payOrder.delivery_fee ?? 0))}
                </span>
              </div>
              <div>
                <div className="h-label mb-2">Método de pago</div>
                <div className="grid grid-cols-2 gap-2">
                  {PAY_METHODS.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMethod(m.id)}
                        className={cn(
                          "flex items-center gap-2 p-3 rounded-xl border-2 transition-all",
                          method === m.id
                            ? "border-[var(--brand-600)] glass-strong text-[var(--ink-900)]"
                            : "border-[var(--g-hairline)] glass text-[var(--ink-500)] hover:border-[var(--brand-600)]/40"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <button type="button" className="g-btn g-btn-ghost" onClick={() => setPayOrder(null)} disabled={submitting}>Cancelar</button>
            <button type="button" className="g-btn g-btn-primary" onClick={confirmPayment} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirmar entrega
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
