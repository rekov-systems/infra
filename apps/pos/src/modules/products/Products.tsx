import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Input } from "@/components/ui/input";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Search, Barcode, Trash2, Upload, FileDown, Download, HelpCircle } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { exportToCsv, parseCsv } from "@/lib/csv";
import { ProductForm } from "./ProductForm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const TYPE_LABELS: Record<string, string> = {
  simple: "Simple",
  composite: "Compuesto",
  production: "Producción",
  combo: "Combo",
  ingredient: "Ingrediente",
  modifier: "Modificador"
};

export default function Products() {
  const { tenantId } = useTenantContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [productType, setProductType] = useState<string>("all");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: products } = useQuery({
    queryKey: ["products", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*, categories(name)")
        .eq("tenant_id", tenantId!).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["categories-list", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await supabase.from("categories").select("id, name").eq("tenant_id", tenantId!).order("name")).data ?? [],
  });

  const filtered = (products ?? []).filter((p: any) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode ?? "").toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryId === "all" || p.category_id === categoryId;
    const matchType = productType === "all" || p.product_type === productType;
    return matchSearch && matchCategory && matchType;
  });

  const handleDelete = async () => {
    if (!deletingId || !tenantId) return;
    try {
      const { error } = await supabase.from("products").delete().eq("id", deletingId).eq("tenant_id", tenantId);
      if (error) throw error;
      toast({ title: "Producto eliminado", description: "El producto ha sido eliminado correctamente." });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (err: any) {
      toast({ title: "Error al eliminar", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadTemplate = () => {
    const template = [
      { name: "Coca Cola 600ml", category_name: "Bebidas", sku: "BEB-001", barcode: "123456789012", price: "2.50", cost: "1.00", product_type: "simple", status: "active" },
      { name: "Carne de Hamburguesa (Caja 10kg)", category_name: "Insumos", sku: "INS-001", barcode: "", price: "0", cost: "50.00", product_type: "ingredient", status: "active" },
      { name: "Hamburguesa Sencilla", category_name: "Platos Principales", sku: "PLA-001", barcode: "", price: "8.50", cost: "3.20", product_type: "composite", status: "active" },
      { name: "Combo Hamburguesa + Gaseosa", category_name: "Combos", sku: "CMB-001", barcode: "", price: "10.00", cost: "4.20", product_type: "combo", status: "active" }
    ];
    exportToCsv(`guia_plantilla_productos_${tenantId}.csv`, template);
  };

  const [importFile, setImportFile] = useState<File | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const executeImport = async () => {
    if (!importFile || !tenantId) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = parseCsv(content);
        if (parsed.length === 0) {
          toast({ title: "Error", description: "El archivo está vacío o tiene un formato incorrecto.", variant: "destructive" });
          return;
        }
        const isValid = parsed.every(row => row.name && row.name.trim() !== "");
        if (!isValid) {
          toast({ title: "Formato inválido", description: "Asegúrate de que todos los productos tengan al menos un 'name' (nombre).", variant: "destructive" });
          return;
        }
        const mapProductType = (type: string | undefined): string => {
          if (!type) return "simple";
          const normalized = type.trim().toLowerCase();
          switch (normalized) {
            case "standard":
            case "simple":
              return "simple";
            case "raw_material":
            case "ingredient":
              return "ingredient";
            case "manufactured":
            case "composite":
              return "composite";
            case "production":
              return "production";
            case "combo":
              return "combo";
            case "modifier":
              return "modifier";
            default:
              return "simple";
          }
        };
        const dataToInsert = parsed.map(row => {
          let category_id = null;
          if (row.category_name && categories) {
            const matched = categories.find(c => c.name.toLowerCase() === row.category_name.trim().toLowerCase());
            if (matched) category_id = matched.id;
          }
          return {
            tenant_id: tenantId,
            name: row.name,
            category_id,
            sku: row.sku || null,
            barcode: row.barcode || null,
            price: parseFloat(row.price) || 0,
            cost: parseFloat(row.cost) || 0,
            product_type: mapProductType(row.product_type),
            status: row.status || "active",
          };
        });
        const { error: deleteError } = await supabase.from("products").delete().eq("tenant_id", tenantId);
        if (deleteError) {
          console.error("Error al borrar productos:", deleteError);
          if (deleteError.code === "23503") {
            throw new Error("No se pueden borrar los productos actuales porque están asociados a pedidos, recetas o movimientos de inventario existentes. Contacta a soporte para una limpieza profunda.");
          }
          throw new Error("Ocurrió un error al intentar limpiar la base de datos de productos.");
        }
        const { error: insertError } = await supabase.from("products").insert(dataToInsert);
        if (insertError) {
          console.error("Error al insertar:", insertError);
          throw new Error("La base de datos se limpió, pero hubo un error insertando los nuevos productos. Verifica que la categoría u otros campos sean válidos.");
        }
        toast({ title: "Sincronización exitosa", description: `Se eliminaron los datos anteriores y se importaron ${dataToInsert.length} productos nuevos.` });
        qc.invalidateQueries({ queryKey: ["products"] });
      } catch (err: any) {
        toast({ title: "Error de Sincronización", description: err.message, variant: "destructive" });
      } finally {
        setImportFile(null);
      }
    };
    reader.readAsText(importFile);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <div className="h-display g-page-title">Productos</div>
        <div className="h-meta g-page-subtitle">{products?.length ?? 0} productos · CATÁLOGO</div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <Input className="pl-9 w-48 lg:w-64" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={productType} onValueChange={setProductType}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="simple">Simple</SelectItem>
            <SelectItem value="composite">Compuesto</SelectItem>
            <SelectItem value="production">Producción</SelectItem>
            <SelectItem value="combo">Combo</SelectItem>
            <SelectItem value="ingredient">Ingrediente</SelectItem>
            <SelectItem value="modifier">Modificador</SelectItem>
          </SelectContent>
        </Select>

        {/* Product type guide dialog */}
        <Dialog>
          <DialogTrigger asChild>
            <button type="button" className="g-btn g-btn-ghost g-btn-icon" title="Explicación de tipos de producto" aria-label="Guía de tipos de producto">
              <HelpCircle className="h-5 w-5 text-ink-400" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Guía de Tipos de Producto</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid gap-4">
                {[
                  { label: "1. Simple", desc: "Producto terminado que se vende directamente. El inventario se descuenta por unidad vendida. Ej: Gaseosa embotellada." },
                  { label: "2. Compuesto (Composite)", desc: "Producto que tiene una receta. Al venderse, descuenta del inventario los ingredientes definidos en su receta. Ej: Hamburguesa." },
                  { label: "3. Producción (Production)", desc: "Producto que preparas en lote para generar stock propio a partir de otros ingredientes. Ej: Salsa de la casa o masa." },
                  { label: "4. Combo", desc: "Agrupación de varios productos que se venden juntos bajo un solo precio. Ej: Combo Almuerzo." },
                  { label: "5. Ingrediente (Ingredient)", desc: "Materias primas que no se venden solas, sino que se usan exclusivamente para recetas. Ej: Sal, harina, carne molida." },
                  { label: "6. Modificador (Modifier)", desc: 'Opciones adicionales para personalizar un pedido. Ej: "Extra Tocino" o "Sin Cebolla".' },
                ].map(({ label, desc }) => (
                  <div key={label} className="space-y-1">
                    <div className="font-semibold text-sm text-brand-500">{label}</div>
                    <p className="text-sm text-ink-500">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileSelect} title="Importar archivo CSV" aria-label="Importar archivo CSV" />

        <button type="button" className="g-btn g-btn-ghost" onClick={() => fileInputRef.current?.click()} title="Importar CSV">
          <Upload className="h-4 w-4" /> Importar
        </button>

        <button type="button" className="g-btn g-btn-ghost" onClick={handleDownloadTemplate} title="Descargar plantilla CSV">
          <FileDown className="h-4 w-4" /> Plantilla
        </button>

        <button
          type="button"
          className="g-btn g-btn-ghost"
          onClick={() => exportToCsv(`productos_${tenantId}.csv`, filtered)}
          title="Exportar filtrados a CSV"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>

        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <button type="button" className="g-btn g-btn-primary" onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4" />Nuevo
            </button>
          </DialogTrigger>
          <ProductForm
            tenantId={tenantId!}
            categories={categories ?? []}
            editing={editing}
            onClose={() => {
              setOpen(false); setEditing(null);
              qc.invalidateQueries({ queryKey: ["products"] });
              qc.invalidateQueries({ queryKey: ["product-components"] });
            }}
          />
        </Dialog>
      </div>

      {/* Products table */}
      <div className="glass rounded-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>SKU / Código</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-ink-500">{p.categories?.name ?? "—"}</TableCell>
                <TableCell>
                  <span className="pill pill-ghost">{TYPE_LABELS[p.product_type] || p.product_type}</span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5 text-xs tabular-nums text-ink-500">
                    {p.sku && <span>{p.sku}</span>}
                    {p.barcode && (
                      <span className="flex items-center gap-1">
                        <Barcode className="h-3 w-3" />{p.barcode}
                      </span>
                    )}
                    {!p.sku && !p.barcode && <span>—</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatCurrency(Number(p.price))}</TableCell>
                <TableCell className="text-right tabular-nums text-ink-500">{formatCurrency(Number(p.cost))}</TableCell>
                <TableCell>
                  <span className={p.status === "active" ? "pill pill-ok" : "pill pill-ghost"}>
                    {p.status}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      className="g-btn g-btn-ghost g-btn-icon"
                      title="Editar producto"
                      aria-label="Editar producto"
                      onClick={() => { setEditing(p); setOpen(true); }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="g-btn g-btn-ghost g-btn-icon g-btn-danger"
                      title="Eliminar producto"
                      aria-label="Eliminar producto"
                      onClick={() => setDeletingId(p.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-ink-400">
                  Sin productos
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirm dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El producto será eliminado permanentemente de la base de datos.
              Si tiene historial de ventas asociado, es posible que no se pueda eliminar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import confirm dialog */}
      <AlertDialog open={!!importFile} onOpenChange={(o) => !o && setImportFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              ⚠️ Advertencia de Importación
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Estás a punto de importar <strong>{importFile?.name}</strong>.</p>
              <p>Esta acción <strong>borrará TODOS los productos actuales</strong> y los reemplazará por los del archivo.</p>
              <p className="font-semibold text-destructive">¿Estás completamente seguro de continuar con el borrado y sincronización total?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeImport} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sí, Borrar e Importar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
