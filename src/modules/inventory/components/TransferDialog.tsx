import { useState } from "react";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function TransferDialog({ tenantId, branchId, userId, products, centers, onClose }: any) {
  const [productId, setProductId] = useState<string>("");
  const [fromCenterId, setFromCenterId] = useState<string>("");
  const [toCenterId, setToCenterId] = useState<string>("");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromCenterId === toCenterId) {
      toast.error("El centro de origen y destino deben ser diferentes");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("transfer_inventory" as any, {
        _tenant_id: tenantId,
        _branch_id: branchId,
        _product_id: productId,
        _from_center_id: fromCenterId,
        _to_center_id: toCenterId,
        _quantity: Number(qty),
        _reason: `Transferencia ${centers.find((c: any) => c.id === fromCenterId)?.name} → ${centers.find((c: any) => c.id === toCenterId)?.name}`,
      });
      if (error) throw error;

      toast.success("Transferencia completada");
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-primary" />
          Transferir Stock
        </DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label>Producto</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
            <SelectContent>
              {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Origen</Label>
            <Select value={fromCenterId} onValueChange={setFromCenterId}>
              <SelectTrigger><SelectValue placeholder="Desde..." /></SelectTrigger>
              <SelectContent>
                {centers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Destino</Label>
            <Select value={toCenterId} onValueChange={setToCenterId}>
              <SelectTrigger><SelectValue placeholder="Hacia..." /></SelectTrigger>
              <SelectContent>
                {centers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Cantidad</Label>
          <Input type="number" step="0.01" required value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.00" className="h-12 text-lg" />
        </div>

        <Button type="submit" className="w-full h-12" disabled={saving || !productId || !qty || !fromCenterId || !toCenterId}>
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</> : "Transferir"}
        </Button>
      </form>
    </DialogContent>
  );
}
