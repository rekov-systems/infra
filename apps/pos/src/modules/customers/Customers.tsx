import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Users, Plus, Pencil, Trash2, Search, Phone, Mail, Heart } from "lucide-react";
import { toast } from "sonner";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document_number: string | null;
  address?: string | null;
  loyalty_points?: number | null;
  created_at: string;
};

type FormData = { name: string; phone: string; email: string; document_number: string; address: string };

const empty: FormData = { name: "", phone: "", email: "", document_number: "", address: "" };

export default function Customers() {
  const { tenantId } = useTenantContext();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<FormData>(empty);

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("customers")
        .select("*").eq("tenant_id", tenantId!).order("name");
      return (data ?? []) as Customer[];
    },
  });

  const save = useMutation({
    mutationFn: async (f: FormData) => {
      const payload = {
        tenant_id: tenantId!,
        name: f.name.trim(),
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        document_number: f.document_number.trim() || null,
        address: f.address.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("customers").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Cliente actualizado" : "Cliente creado");
      qc.invalidateQueries({ queryKey: ["customers"] });
      setOpen(false);
      setEditing(null);
      setForm(empty);
    },
    onError: (e: any) => toast.error(e.message ?? "Error al guardar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente eliminado");
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error al eliminar"),
  });

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", document_number: c.document_number ?? "", address: (c as any).address ?? "" });
    setOpen(true);
  };

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? "").includes(search) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.document_number ?? "").includes(search)
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="orb">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="h-meta g-page-subtitle text-ink-400">OPERACIÓN · CLIENTES</div>
            <h1 className="h-display g-page-title">Clientes</h1>
            <div className="h-meta g-page-subtitle text-ink-500">
              {customers.length} cliente{customers.length !== 1 ? "s" : ""} registrado{customers.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        <button type="button" className="g-btn g-btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, teléfono, NIT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table / Empty */}
      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="orb mx-auto mb-4">
            <Users className="h-7 w-7" />
          </div>
          <h2 className="h-display font-semibold text-lg">Sin clientes</h2>
          <p className="h-meta g-page-subtitle text-ink-500 mt-1">
            Registra tus clientes para vincularlos a ventas y ver su historial.
          </p>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1fr_2fr_2fr_100px_72px] gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-400 border-b border-white/10">
            <span>Nombre</span>
            <span>Documento</span>
            <span>Contacto</span>
            <span>Dirección</span>
            <span className="text-right">Puntos</span>
            <span />
          </div>

          {/* Rows */}
          {filtered.map((c, idx) => (
            <div
              key={c.id}
              className={`grid grid-cols-[2fr_1fr_2fr_2fr_100px_72px] gap-3 px-4 py-3 items-center hover:bg-white/5 transition-colors${idx < filtered.length - 1 ? " border-b border-white/10" : ""}`}
            >
              <span className="font-medium text-sm text-ink-900">{c.name}</span>

              <span className="text-sm tabular-nums text-ink-500">
                {c.document_number ?? "—"}
              </span>

              <div className="flex flex-col gap-0.5">
                {c.phone && (
                  <span className="flex items-center gap-1 text-sm text-ink-700">
                    <Phone className="h-3 w-3 text-ink-400" />{c.phone}
                  </span>
                )}
                {c.email && (
                  <span className="flex items-center gap-1 text-sm text-ink-500">
                    <Mail className="h-3 w-3 text-ink-400" />{c.email}
                  </span>
                )}
                {!c.phone && !c.email && <span className="text-sm text-ink-400">—</span>}
              </div>

              <span className="text-sm text-ink-500">
                {(c as any).address ?? "—"}
              </span>

              <div className="flex justify-end">
                <span className="g-pill g-pill-warn flex items-center gap-1">
                  <Heart className="h-3 w-3 fill-current" />
                  {c.loyalty_points ?? 0}
                </span>
              </div>

              <div className="flex gap-1 justify-end">
                <button
                  type="button"
                  aria-label="Editar cliente"
                  className="g-btn g-btn-ghost h-8 w-8 p-0 flex items-center justify-center"
                  onClick={() => openEdit(c)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Eliminar cliente"
                  className="g-btn g-btn-ghost h-8 w-8 p-0 flex items-center justify-center text-g-bad"
                  onClick={() => { if (confirm("¿Eliminar cliente?")) remove.mutate(c.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(empty); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nombre completo o razón social" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>NIT / CC</Label>
                <Input value={form.document_number} onChange={(e) => setForm((f) => ({ ...f, document_number: e.target.value }))} placeholder="123456789" />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="300 000 0000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Correo electrónico</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="cliente@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Calle 123 # 45-67" />
            </div>
            <button
              type="button"
              className="g-btn g-btn-primary w-full"
              disabled={!form.name.trim() || save.isPending}
              onClick={() => save.mutate(form)}
            >
              {save.isPending ? "Guardando..." : editing ? "Guardar cambios" : "Crear cliente"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
