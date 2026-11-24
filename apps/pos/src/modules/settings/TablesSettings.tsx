import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

export default function TablesSettings() {
  const { tenantId, branchId, branches } = useTenantContext();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [qrTable, setQrTable] = useState<any>(null);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [scopeBranch, setScopeBranch] = useState<string>(branchId ?? "");
  const [waiterId, setWaiterId] = useState<string>("");

  const { data: waiters } = useQuery({
    queryKey: ["tenant-waiters", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", tenantId!)
        .in("role", ["waiter", "cashier", "manager", "admin", "owner"]);
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [];
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return data ?? [];
    },
  });

  const { data: tables } = useQuery({
    queryKey: ["tables-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tables").select("*").eq("tenant_id", tenantId!).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => {
    setEditing(null);
    setName("");
    setCapacity(4);
    setScopeBranch(branchId ?? branches[0]?.id ?? "");
    setWaiterId("");
  };

  const openNew = () => { reset(); setOpen(true); };
  const openEdit = (t: any) => {
    setEditing(t);
    setName(t.name);
    setCapacity(t.capacity ?? 4);
    setScopeBranch(t.branch_id);
    setWaiterId(t.assigned_waiter_id ?? "");
    setOpen(true);
  };

  const save = async () => {
    if (!tenantId || !scopeBranch || !name.trim()) return toast.error("Completa los campos");
    const payload = {
      name: name.trim(), capacity, branch_id: scopeBranch,
      assigned_waiter_id: waiterId || null,
    };
    if (editing) {
      const { error } = await supabase.from("tables").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("tables").insert({
        tenant_id: tenantId, ...payload,
        sort_order: (tables?.length ?? 0) + 1,
      });
      if (error) return toast.error(error.message);
    }
    toast.success("Mesa guardada");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["tables-settings"] });
    qc.invalidateQueries({ queryKey: ["tables"] });
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar esta mesa?")) return;
    const { error } = await supabase.from("tables").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tables-settings"] });
    qc.invalidateQueries({ queryKey: ["tables"] });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-ink-900">Mesas</p>
          <p className="h-meta">Catálogo de mesas por sucursal</p>
        </div>
        <button type="button" className="g-btn g-btn-primary" onClick={openNew}>
          <Plus className="h-4 w-4" /> Nueva mesa
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {(tables ?? []).map((t) => {
          const branch = branches.find((b) => b.id === t.branch_id);
          return (
            <div key={t.id} className="glass rounded-xl p-3">
              <div className="flex items-start justify-between">
                <div className="font-bold text-lg text-ink-900">{t.name}</div>
                <span className="g-pill g-pill-ghost g-pill-h20">{t.capacity} pax</span>
              </div>
              <div className="h-meta mt-1 truncate">{branch?.name ?? "—"}</div>
              <div className="flex gap-1 mt-2">
                <button type="button" className="g-btn g-btn-ghost h-7 px-2" title="Editar mesa" onClick={() => openEdit(t)}>
                  <Pencil className="h-3 w-3" />
                </button>
                <button type="button" className="g-btn g-btn-ghost h-7 px-2" title="Ver QR" onClick={() => setQrTable(t)}>
                  <QrCode className="h-3 w-3" />
                </button>
                <button type="button" className="g-btn g-btn-ghost h-7 px-2 text-red-500 hover:text-red-600" title="Eliminar mesa" onClick={() => remove(t.id)}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
        {(tables ?? []).length === 0 && (
          <div className="col-span-full text-center py-12 h-meta">
            Aún no hay mesas. Crea la primera con "Nueva mesa".
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar mesa" : "Nueva mesa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Sucursal</Label>
              <Select value={scopeBranch} onValueChange={setScopeBranch}>
                <SelectTrigger><SelectValue placeholder="Selecciona sucursal" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nombre / Número</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mesa 1" />
            </div>
            <div className="space-y-1.5">
              <Label>Capacidad</Label>
              <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Mesero asignado (opcional)</Label>
              <Select value={waiterId || "none"} onValueChange={(v) => setWaiterId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar (cualquier mesero puede tomarla)</SelectItem>
                  {(waiters ?? []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.full_name ?? w.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <button type="button" className="g-btn g-btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="button" className="g-btn g-btn-primary" onClick={save}>Guardar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Dialog */}
      <Dialog open={!!qrTable} onOpenChange={(o) => { if (!o) setQrTable(null); }}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle>QR · {qrTable?.name}</DialogTitle>
          </DialogHeader>
          {qrTable && (() => {
            const url = `${window.location.origin}/qr/${qrTable.branch_id}?table=${qrTable.id}`;
            return (
              <div className="flex flex-col items-center gap-4 py-2">
                <QRCodeSVG value={url} size={200} level="M" />
                <p className="h-meta break-all">{url}</p>
                <button
                  type="button"
                  className="g-btn g-btn-ghost"
                  onClick={() => { navigator.clipboard.writeText(url); toast.success("URL copiada"); }}
                >
                  Copiar URL
                </button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
