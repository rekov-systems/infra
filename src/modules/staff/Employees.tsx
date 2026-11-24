import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";

const ROLES = ["owner", "admin", "manager", "cashier", "waiter", "courier", "kitchen", "inventory", "staff"] as const;

export default function Employees() {
  const { tenantId, branchId } = useTenantContext();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: employees } = useQuery({
    queryKey: ["employees", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await supabase.from("employees").select("*")
      .eq("tenant_id", tenantId!).order("full_name")).data ?? [],
  });

  const list = employees ?? [];

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="orb">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="h-meta g-page-subtitle text-ink-400">NEGOCIO · PERSONAL</div>
            <h1 className="h-display g-page-title">Empleados</h1>
            <div className="h-meta g-page-subtitle text-ink-500">
              {list.length} miembro{list.length !== 1 ? "s" : ""} del equipo
            </div>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button type="button" className="g-btn g-btn-primary">
              <Plus className="h-4 w-4" />
              Nuevo empleado
            </button>
          </DialogTrigger>
          <EmployeeForm
            tenantId={tenantId!}
            branchId={branchId!}
            onClose={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["employees"] }); }}
          />
        </Dialog>
      </div>

      {/* Table */}
      {list.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="orb mx-auto mb-4">
            <Users className="h-7 w-7" />
          </div>
          <h2 className="h-display font-semibold text-lg">Sin empleados</h2>
          <p className="h-meta g-page-subtitle text-ink-500 mt-1">
            Agrega los miembros de tu equipo para gestionar turnos y accesos.
          </p>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[2fr_2fr_1fr_120px_90px] gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-400 border-b border-white/10">
            <span>Nombre</span>
            <span>Email</span>
            <span>Teléfono</span>
            <span>Rol</span>
            <span>Estado</span>
          </div>
          {list.map((e: any, idx: number) => (
            <div
              key={e.id}
              className={`grid grid-cols-[2fr_2fr_1fr_120px_90px] gap-3 px-4 py-3 items-center hover:bg-white/5 transition-colors${idx < list.length - 1 ? " border-b border-white/10" : ""}`}
            >
              <span className="font-medium text-sm text-ink-900">{e.full_name}</span>
              <span className="text-sm text-ink-700">{e.email ?? "—"}</span>
              <span className="text-sm text-ink-700">{e.phone ?? "—"}</span>
              <span className="g-pill g-pill-ghost capitalize">{e.role}</span>
              <span>
                {e.status === "active"
                  ? <span className="g-pill g-pill-ok">Activo</span>
                  : <span className="g-pill g-pill-ghost">{e.status}</span>
                }
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeForm({ tenantId, branchId, onClose }: { tenantId: string; branchId: string; onClose: () => void }) {
  const [form, setForm] = useState<any>({ full_name: "", email: "", phone: "", role: "cashier", pin: "", status: "active" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("employees").insert({ ...form, tenant_id: tenantId, branch_id: branchId });
    if (error) return toast.error(error.message);
    toast.success("Empleado creado");
    onClose();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Nuevo empleado</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Nombre completo</Label>
          <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Rol</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>PIN (4-6 dígitos)</Label>
            <Input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
          </div>
        </div>
        <button type="submit" className="g-btn g-btn-primary w-full g-btn-touch">
          Crear empleado
        </button>
      </form>
    </DialogContent>
  );
}
