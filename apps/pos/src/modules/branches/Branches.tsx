import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Store, Pencil, Trash2, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Branch } from "@/types/branch";


export default function Branches() {
  const { tenantId, hasRole } = useTenantContext();
  const qc = useQueryClient();
  const canManage = hasRole("owner", "admin");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data: branches, isLoading } = useQuery({
    queryKey: ["branches-admin", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, address, phone, status, tenant_id, table_view_mode")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", address: "", phone: "" });
    setOpen(true);
  };

  const openEdit = (b: Branch) => {
    setEditing(b);
    setForm({ name: b.name, address: b.address ?? "", phone: b.phone ?? "" });
    setOpen(true);
  };

  const save = async () => {
    if (!tenantId) return;
    if (!form.name.trim()) return toast.error("Nombre requerido");
    try {
      if (editing) {
        const { error } = await supabase
          .from("branches")
          .update({ name: form.name, address: form.address || null, phone: form.phone || null })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Sucursal actualizada");
      } else {
        const { data: branch, error } = await supabase
          .from("branches")
          .insert({
            tenant_id: tenantId,
            name: form.name,
            address: form.address || null,
            phone: form.phone || null,
          })
          .select()
          .single();
        if (error) throw error;
        await supabase
          .from("cash_registers")
          .insert({ tenant_id: tenantId, branch_id: branch.id, name: "Caja 1" });
        toast.success("Sucursal creada");
      }
      qc.invalidateQueries({ queryKey: ["branches-admin"] });
      qc.invalidateQueries({ queryKey: ["branches"] });
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleStatus = async (b: Branch) => {
    const next = b.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("branches").update({ status: next }).eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success(`Sucursal ${next === "active" ? "activada" : "desactivada"}`);
    qc.invalidateQueries({ queryKey: ["branches-admin"] });
    qc.invalidateQueries({ queryKey: ["branches"] });
  };

  const handleDelete = async (b: Branch) => {
    const total = branches?.length ?? 0;
    if (total <= 1) {
      return toast.error("No puedes eliminar la única sucursal. Debes tener al menos una.");
    }
    if (
      !confirm(
        `¿Eliminar la sucursal "${b.name}"?\n\nSe eliminarán también sus cajas registradoras y datos asociados. Esta acción no se puede deshacer.`
      )
    )
      return;

    setDeleting(b.id);
    try {
      await supabase.from("cash_registers").delete().eq("branch_id", b.id);
      const { error } = await supabase.from("branches").delete().eq("id", b.id);
      if (error) throw error;
      toast.success(`Sucursal "${b.name}" eliminada`);
      qc.invalidateQueries({ queryKey: ["branches-admin"] });
      qc.invalidateQueries({ queryKey: ["branches"] });
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo eliminar");
    } finally {
      setDeleting(null);
    }
  };

  const activeCount = branches?.filter((b) => b.status === "active").length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="g-branches-header">
        <div className="orb g-branches-header-orb">
          <Store className="h-5 w-5" />
        </div>
        <div className="g-branches-header-info">
          <div className="g-branches-eyebrow">NEGOCIO · SUCURSALES</div>
          <h1 className="g-branches-title">Sucursales</h1>
          <div className="h-meta">
            {branches?.length ?? 0} registradas · {activeCount} activas
          </div>
        </div>
        {canManage && (
          <button type="button" className="g-btn g-btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nueva sucursal
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="h-meta text-center py-16">Cargando…</div>
      ) : !branches || branches.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Sin sucursales"
          description="Crea tu primera sucursal para empezar a operar"
        />
      ) : (
        <div className="g-branches-grid">
          {branches.map((b) => {
            const isActive = b.status === "active";
            const isDeleting = deleting === b.id;
            return (
              <div key={b.id} className="glass g-branch-card">
                {/* Top row */}
                <div className="g-branch-card-top">
                  <div className="g-branch-card-identity">
                    <div className="orb g-branch-card-orb">
                      <Store className="h-4 w-4" />
                    </div>
                    <div className="g-branch-card-name-wrap">
                      <div className="g-branch-card-name">{b.name}</div>
                      <div className="g-branch-card-pill-row">
                        <span className={"g-pill " + (isActive ? "g-pill-ok" : "g-pill-ghost")}>
                          {isActive ? "Activa" : "Inactiva"}
                        </span>
                      </div>
                    </div>
                  </div>
                  {canManage && (
                    <div className="g-branch-card-actions">
                      <button
                        type="button"
                        className="g-btn g-btn-ghost g-btn-icon"
                        onClick={() => openEdit(b)}
                        title="Editar sucursal"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="g-btn g-btn-ghost g-btn-icon g-branch-card-del-btn"
                        disabled={isDeleting || (branches?.length ?? 0) <= 1}
                        onClick={() => handleDelete(b)}
                        title={(branches?.length ?? 0) <= 1 ? "No puedes eliminar la única sucursal" : "Eliminar sucursal"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Contact info */}
                {(b.address || b.phone) && (
                  <div className="glass-thin g-branch-info-block">
                    {b.address && (
                      <div className="g-branch-info-row">
                        <MapPin className="h-3.5 w-3.5 g-branch-info-icon" />
                        <span className="g-branch-info-text">{b.address}</span>
                      </div>
                    )}
                    {b.phone && (
                      <div className="g-branch-info-row">
                        <Phone className="h-3.5 w-3.5 g-branch-info-icon" />
                        <span className="g-branch-info-text">{b.phone}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Toggle status */}
                {canManage && (
                  <button
                    type="button"
                    className="g-btn g-btn-ghost g-branch-toggle-btn"
                    onClick={() => toggleStatus(b)}
                  >
                    {isActive ? "Desactivar" : "Activar"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar sucursal" : "Nueva sucursal"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <button type="button" className="g-btn g-btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="button" className="g-btn g-btn-primary" onClick={save}>Guardar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
