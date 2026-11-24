import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { CreditCard, Eye, Users, Clock, UtensilsCrossed } from "lucide-react";
import { PaymentDialog, type PayMethod } from "@/modules/pos/PaymentDialog";
import { toast } from "sonner";

interface Props {
  tenantId: string;
  branchId: string;
}

export function PendingTableOrders({ tenantId, branchId }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [payOrder, setPayOrder] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: orders } = useQuery({
    queryKey: ["pending-table-orders", branchId],
    enabled: !!branchId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("table_orders")
        .select("*, tables(name), table_order_items(id, status, product_name, quantity)")
        .eq("tenant_id", tenantId)
        .eq("branch_id", branchId)
        .eq("status", "sent_to_cashier")
        .order("sent_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const waiterIds = Array.from(new Set((orders ?? []).map((o: any) => o.waiter_id).filter(Boolean)));
  const { data: waiters } = useQuery({
    queryKey: ["waiter-profiles", waiterIds.join(",")],
    enabled: waiterIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", waiterIds);
      const m: Record<string, string> = {};
      (data ?? []).forEach((p) => { m[p.id] = p.full_name ?? "—"; });
      return m;
    },
  });

  useEffect(() => {
    if (!branchId) return;
    const ch = supabase
      .channel(`pending-tables-${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_orders", filter: `branch_id=eq.${branchId}` }, () => {
        qc.invalidateQueries({ queryKey: ["pending-table-orders", branchId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [branchId, qc]);

  const charge = async (method: PayMethod, _tendered: number, tipAmount: number, couponCode?: string, discountAmount = 0) => {
    if (!payOrder) return;
    setSubmitting(true);
    try {
      const payableTotal = Math.max(0, Number(payOrder.total) - discountAmount + tipAmount);
      const { error } = await supabase.rpc("checkout_table_order", {
        _order_id: payOrder.id,
        _payments: [{ method, amount: payableTotal, reference: null }] as any,
        _tip_amount: tipAmount,
        _discount_total: discountAmount,
        _coupon_code: couponCode ?? null,
        _client_mutation_id: crypto.randomUUID(),
      } as any);
      if (error) throw error;
      toast.success(`Cobro registrado · ${formatCurrency(payableTotal)}`);
      setPayOrder(null);
      qc.invalidateQueries({ queryKey: ["pending-table-orders"] });
      qc.invalidateQueries({ queryKey: ["open-session"] });
      qc.invalidateQueries({ queryKey: ["table-orders-open"] });
      qc.invalidateQueries({ queryKey: ["tables"] });
    } catch (err: any) {
      toast.error(err.message ?? "Error al cobrar");
    } finally {
      setSubmitting(false);
    }
  };

  const list = orders ?? [];

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b g-pending-header">
        <div className="flex items-center gap-2">
          <UtensilsCrossed size={16} className="g-pending-icon" />
          <span className="font-semibold g-pending-header-label">Cuentas de mesa pendientes</span>
          {list.length > 0 && (
            <span className="pill pill-warn g-kds-pill-micro">{list.length}</span>
          )}
        </div>
        <span className="h-meta">Tiempo real</span>
      </div>

      {list.length === 0 ? (
        <div className="py-10 text-center h-meta">No hay cuentas enviadas por meseros.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
          {list.map((o: any) => {
            const items = (o.table_order_items ?? []).filter((i: any) => i.status !== "cancelled");
            const minutes = o.sent_at
              ? Math.max(0, Math.round((Date.now() - new Date(o.sent_at).getTime()) / 60000))
              : 0;
            const waiter = waiters?.[o.waiter_id] ?? "—";
            return (
              <div key={o.id} className="glass-thin rounded-2xl p-3 flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="h-display g-pending-table-name">{o.tables?.name ?? "Mesa"}</div>
                    <div className="h-meta flex items-center gap-2 mt-0.5">
                      <Users size={12} /> {waiter}
                      <span className="opacity-40">·</span>
                      <Clock size={12} /> {minutes}m
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="h-num g-pending-total">{formatCurrency(Number(o.total))}</div>
                    <div className="h-meta mt-0.5">{items.length} items</div>
                  </div>
                </div>

                <div className="h-meta line-clamp-2">
                  {items.slice(0, 4).map((i: any) => `${Number(i.quantity)}× ${i.product_name}`).join(" · ")}
                  {items.length > 4 && ` +${items.length - 4}…`}
                </div>

                <div className="grid g-pending-grid gap-2 mt-auto">
                  <button type="button" className="g-btn g-btn-primary g-pending-cobrar"
                    onClick={() => setPayOrder(o)}>
                    <CreditCard size={14} /> Cobrar
                  </button>
                  <button type="button" className="g-btn g-btn-ghost g-pending-view"
                    title="Ver comanda"
                    onClick={() => navigate(`/tables/${o.id}`)}>
                    <Eye size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PaymentDialog
        open={!!payOrder}
        onOpenChange={(o) => !o && setPayOrder(null)}
        total={Number(payOrder?.total ?? 0)}
        tenantId={tenantId}
        submitting={submitting}
        onConfirm={charge}
      />
    </div>
  );
}
