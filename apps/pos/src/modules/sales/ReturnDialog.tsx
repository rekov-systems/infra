import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/format";
import { Undo2, AlertTriangle, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  created_at: string;
  sale_items: SaleItem[];
};

interface ReturnDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sale: Sale | null;
}

export function ReturnDialog({ open, onOpenChange, sale }: ReturnDialogProps) {
  const { tenantId, branchId } = useTenantContext();
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [supervisorPin, setSupervisorPin] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedItems = sale?.sale_items.filter((i) => selectedIds.has(i.id)) ?? [];
  const returnTotal = selectedItems.reduce((s, i) => s + Number(i.line_total), 0);

  const processReturn = useMutation({
    mutationFn: async () => {
      if (!sale || !tenantId || !branchId || selectedItems.length === 0) return;

      let evidenceUrl: string | null = null;
      if (evidenceFile) {
        const ext = evidenceFile.name.split(".").pop() || "jpg";
        const path = `${tenantId}/${sale.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("return-evidence")
          .upload(path, evidenceFile, { upsert: false });
        if (uploadError) throw uploadError;
        evidenceUrl = path;
      }

      const { error } = await supabase.rpc("process_sale_return" as any, {
        _sale_id: sale.id,
        _items: selectedItems.map((i) => ({ sale_item_id: i.id, quantity: i.quantity })),
        _reason: reason.trim() || null,
        _supervisor_pin: supervisorPin || null,
        _evidence_url: evidenceUrl,
        _refund_method: "original",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Devolución registrada · ${formatCurrency(returnTotal)}`);
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["pos-stocks"] });
      onOpenChange(false);
      setSelectedIds(new Set());
      setReason("");
      setSupervisorPin("");
      setEvidenceFile(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Error al procesar devolución"),
  });

  if (!sale) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setSelectedIds(new Set());
          setReason("");
          setSupervisorPin("");
          setEvidenceFile(null);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 g-return-undo-icon" />
            Devolución — Ticket #{sale.ticket_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <p className="h-meta">Selecciona los productos a devolver:</p>

          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {sale.sale_items.map((item) => (
              <label
                key={item.id}
                className="glass-thin flex items-center gap-3 p-3 rounded-xl cursor-pointer"
              >
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => toggle(item.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{item.product_name}</div>
                  <div className="h-meta">
                    {item.quantity} × {formatCurrency(Number(item.unit_price))}
                  </div>
                </div>
                <span className="pill pill-ghost tabular-nums">
                  {formatCurrency(Number(item.line_total))}
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Motivo de devolución</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Producto en mal estado, error en pedido..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>PIN supervisor</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={supervisorPin}
                onChange={(e) => setSupervisorPin(e.target.value)}
                placeholder="Requerido según monto"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" /> Foto soporte
              </Label>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {selectedItems.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-sm g-return-warning">
              <AlertTriangle className="h-4 w-4 shrink-0 g-return-warning-icon" />
              <span>
                Se revertirá inventario de <strong>{selectedItems.length}</strong>{" "}
                producto(s) por <strong>{formatCurrency(returnTotal)}</strong>.
              </span>
            </div>
          )}

          <button
            type="button"
            className="g-btn g-btn-primary w-full g-btn-touch"
            disabled={selectedItems.length === 0 || processReturn.isPending}
            onClick={() => processReturn.mutate()}
          >
            {processReturn.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Procesando…</>
              : `Procesar devolución · ${formatCurrency(returnTotal)}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
