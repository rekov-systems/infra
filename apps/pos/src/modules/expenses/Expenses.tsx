import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingDown, Plus, Pencil, Trash2, Tag } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

type Category = { id: string; name: string };
type Expense = {
  id: string;
  amount: number;
  payment_method: string;
  description: string | null;
  expense_date: string;
  category_id: string | null;
  expense_categories?: { name: string } | null;
};

type ExpenseForm = {
  category_id: string;
  amount: string;
  payment_method: string;
  description: string;
  expense_date: string;
};

const emptyExpense: ExpenseForm = {
  category_id: "",
  amount: "",
  payment_method: "cash",
  description: "",
  expense_date: new Date().toISOString().slice(0, 10),
};

const PAY_METHODS = [
  { id: "cash",     label: "Efectivo" },
  { id: "card",     label: "Tarjeta" },
  { id: "transfer", label: "Transferencia" },
];

export default function Expenses() {
  const { tenantId, branchId } = useTenantContext();
  const qc = useQueryClient();
  const [tab, setTab] = useState("expenses");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpense);
  const [catName, setCatName] = useState("");

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["expense-categories", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("expense_categories")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .order("name");
      return (data ?? []) as Category[];
    },
  });

  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ["expenses", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("expenses")
        .select("*, expense_categories(name)")
        .eq("branch_id", branchId!)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as Expense[];
    },
  });

  const totalMonth = expenses
    .filter((e) => e.expense_date.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((s, e) => s + Number(e.amount), 0);

  const saveExpense = useMutation({
    mutationFn: async (f: ExpenseForm) => {
      const payload = {
        tenant_id: tenantId!,
        branch_id: branchId!,
        category_id: f.category_id || null,
        amount: parseFloat(f.amount),
        payment_method: f.payment_method,
        description: f.description.trim() || null,
        expense_date: f.expense_date,
      };
      if (editingExpense) {
        const { error } = await (supabase as any).from("expenses").update(payload).eq("id", editingExpense.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("expenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingExpense ? "Gasto actualizado" : "Gasto registrado");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setExpenseOpen(false);
      setEditingExpense(null);
      setExpenseForm(emptyExpense);
    },
    onError: (e: any) => toast.error(e.message ?? "Error al guardar"),
  });

  const removeExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gasto eliminado");
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const saveCat = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("expense_categories")
        .insert({ tenant_id: tenantId!, name: catName.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Categoría creada");
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
      setCatOpen(false);
      setCatName("");
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const openCreate = () => {
    setEditingExpense(null);
    setExpenseForm(emptyExpense);
    setExpenseOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditingExpense(e);
    setExpenseForm({
      category_id: e.category_id ?? "",
      amount: String(e.amount),
      payment_method: e.payment_method,
      description: e.description ?? "",
      expense_date: e.expense_date,
    });
    setExpenseOpen(true);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="g-page-hd">
          <div className="g-page-hd-eyebrow">FINANZAS · GASTOS</div>
          <div className="h-display g-page-title">Gastos</div>
          <div className="g-page-hd-meta">Este mes: {formatCurrency(totalMonth)}</div>
        </div>
        <button type="button" className="g-btn g-btn-primary" onClick={openCreate}>
          <Plus size={16} className="mr-1" />Registrar gasto
        </button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="expenses">Gastos</TabsTrigger>
          <TabsTrigger value="categories">Categorías</TabsTrigger>
        </TabsList>

        {/* ── Expenses tab ── */}
        <TabsContent value="expenses" className="mt-4">
          {expenses.length === 0 ? (
            <EmptyState
              icon={TrendingDown}
              title="Sin gastos registrados"
              description="Registra arriendo, nómina, servicios y otros gastos operativos."
            />
          ) : (
            <div className="glass rounded-2xl overflow-hidden">
              <div className="g-exp-head">
                <span>Fecha</span>
                <span>Descripción</span>
                <span>Categoría</span>
                <span>Método</span>
                <span className="text-right">Monto</span>
                <span />
              </div>
              {expenses.map((e) => (
                <div key={e.id} className="g-exp-row">
                  <span className="g-exp-date">{e.expense_date}</span>
                  <span className="g-exp-desc">{e.description ?? "—"}</span>
                  <span>
                    {e.expense_categories?.name ? (
                      <span className="g-pill g-pill-ghost">
                        <Tag size={11} />
                        {e.expense_categories.name}
                      </span>
                    ) : (
                      <span className="h-meta">Sin categoría</span>
                    )}
                  </span>
                  <span className="g-exp-pay">
                    {PAY_METHODS.find((m) => m.id === e.payment_method)?.label ?? e.payment_method}
                  </span>
                  <span className="g-exp-amt">{formatCurrency(Number(e.amount))}</span>
                  <span className="g-exp-actions">
                    <button
                      type="button"
                      title="Editar gasto"
                      className="g-exp-icon-btn"
                      onClick={() => openEdit(e)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title="Eliminar gasto"
                      className="g-exp-icon-btn g-exp-icon-btn-del"
                      onClick={() => { if (confirm("¿Eliminar gasto?")) removeExpense.mutate(e.id); }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Categories tab ── */}
        <TabsContent value="categories" className="mt-4">
          <div className="flex gap-2 mb-4">
            <button type="button" className="g-btn g-btn-ghost" onClick={() => setCatOpen(true)}>
              <Plus size={16} className="mr-1" />Nueva categoría
            </button>
          </div>
          {categories.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="Sin categorías"
              description="Crea categorías como Arriendo, Nómina, Servicios, etc."
            />
          ) : (
            <div className="glass rounded-2xl overflow-hidden">
              <div className="g-cat-head">
                <span>Nombre</span>
              </div>
              {categories.map((c) => (
                <div key={c.id} className="g-cat-row">
                  <span className="g-cat-name">{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Expense dialog */}
      <Dialog
        open={expenseOpen}
        onOpenChange={(v) => {
          setExpenseOpen(v);
          if (!v) { setEditingExpense(null); setExpenseForm(emptyExpense); }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Editar gasto" : "Registrar gasto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Monto *</Label>
                <Input
                  type="number"
                  min="0"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha *</Label>
                <Input
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm((f) => ({ ...f, expense_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select
                value={expenseForm.category_id}
                onValueChange={(v) => setExpenseForm((f) => ({ ...f, category_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Método de pago</Label>
              <Select
                value={expenseForm.payment_method}
                onValueChange={(v) => setExpenseForm((f) => ({ ...f, payment_method: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAY_METHODS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input
                value={expenseForm.description}
                onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ej: Arriendo local, pago de servicios..."
              />
            </div>
            <button
              type="button"
              className="g-btn g-btn-primary g-btn-touch w-full"
              disabled={!expenseForm.amount || saveExpense.isPending}
              onClick={() => saveExpense.mutate(expenseForm)}
            >
              {saveExpense.isPending ? "Guardando..." : editingExpense ? "Guardar cambios" : "Registrar gasto"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category dialog */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nueva categoría</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Ej: Arriendo, Nómina, Servicios..."
              />
            </div>
            <button
              type="button"
              className="g-btn g-btn-primary g-btn-touch w-full"
              disabled={!catName.trim() || saveCat.isPending}
              onClick={() => saveCat.mutate()}
            >
              {saveCat.isPending ? "Guardando..." : "Crear categoría"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
