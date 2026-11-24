import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatCurrency } from "@/lib/format";
import { Receipt, Undo2 } from "lucide-react";
import { ReturnDialog } from "./ReturnDialog";

type SaleItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type Sale = {
  id: string;
  ticket_number: number;
  total: number;
  status: string;
  created_at: string;
  sale_items: SaleItem[];
  payments: { method: string; amount: number }[];
};

export default function Sales() {
  const { branchId } = useTenantContext();
  const [returnSale, setReturnSale] = useState<Sale | null>(null);

  const { data: sales } = useQuery<Sale[]>({
    queryKey: ["sales", branchId],
    enabled: !!branchId,
    queryFn: async () =>
      ((await supabase
        .from("sales")
        .select(
          "id, ticket_number, total, status, created_at, sale_items(id, product_id, product_name, quantity, unit_price, line_total), payments(method, amount)"
        )
        .eq("branch_id", branchId!)
        .order("created_at", { ascending: false })
        .limit(100)).data ?? []) as Sale[],
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="g-page-hd">
        <div className="g-page-hd-eyebrow">OPERACIÓN · VENTAS</div>
        <div className="h-display g-page-title">Ventas</div>
        <div className="g-page-hd-meta">{sales?.length ?? 0} ventas recientes</div>
      </div>

      {!sales || sales.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Aún no hay ventas"
          description="Las ventas aparecerán aquí en cuanto cierres tu primer ticket en el POS."
        />
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="g-sales-head">
            <span>Ticket</span>
            <span>Fecha</span>
            <span>Items</span>
            <span>Pago</span>
            <span className="text-right">Total</span>
            <span>Estado</span>
            <span />
          </div>

          {sales.map((s) => (
            <div key={s.id} className="g-sales-row">
              <span className="g-sales-ticket">#{s.ticket_number}</span>
              <span className="g-sales-date">
                {new Date(s.created_at).toLocaleString("es-CO")}
              </span>
              <span className="g-sales-count">
                {s.sale_items?.length ?? 0} prod.
              </span>
              <span className="g-sales-pay">
                {s.payments?.map((p) => p.method).join(", ") || "—"}
              </span>
              <span className="g-sales-total">
                {formatCurrency(Number(s.total))}
              </span>
              <span>
                <span className={s.status === "completed" ? "g-pill g-pill-ok" : "g-pill g-pill-ghost"}>
                  {s.status === "completed" ? "Completada" : s.status}
                </span>
              </span>
              <span>
                {s.status === "completed" && (
                  <button
                    type="button"
                    className="g-sales-return"
                    onClick={() => setReturnSale(s)}
                  >
                    <Undo2 size={13} />
                    Devolver
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <ReturnDialog
        open={!!returnSale}
        onOpenChange={(v) => { if (!v) setReturnSale(null); }}
        sale={returnSale}
      />
    </div>
  );
}
