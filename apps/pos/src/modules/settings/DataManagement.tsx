import { useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, Upload, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet, Box } from "lucide-react";
import { exportToCsv, parseCsv } from "@/lib/csv";
import { applyInventoryMovement } from "@/lib/inventory";
import { toast } from "sonner";
import { useInventoryCenters } from "@/hooks/useInventoryCenters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function DataManagement() {
  const { tenantId, branchId } = useTenantContext();
  const { centers, defaultCenter } = useInventoryCenters();
  const [loading, setLoading] = useState(false);
  const [selectedCenterId, setSelectedCenterId] = useState<string>("");
  const [progress, setProgress] = useState<{ total: number; current: number } | null>(null);

  // Auto-seleccionar centro por defecto
  if (!selectedCenterId && defaultCenter) {
    setSelectedCenterId(defaultCenter.id);
  }

  const exportProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, barcode, price, cost, tax_rate, min_stock, status, unit_code, product_type")
        .eq("tenant_id", tenantId!);

      if (error) throw error;
      exportToCsv(`productos_${new Date().toISOString().split('T')[0]}.csv`, data || []);
      toast.success("Catálogo exportado");
    } catch (err: any) {
      toast.error("Error al exportar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportInventory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inventory_stocks")
        .select("products(name, sku), inventory_centers(name), quantity")
        .eq("tenant_id", tenantId!)
        .eq("branch_id", branchId!);

      if (error) throw error;

      const flatData = (data || []).map((s: any) => ({
        producto: s.products?.name,
        sku: s.products?.sku,
        centro: s.inventory_centers?.name,
        cantidad: s.quantity
      }));

      exportToCsv(`inventario_${new Date().toISOString().split('T')[0]}.csv`, flatData);
      toast.success("Inventario exportado");
    } catch (err: any) {
      toast.error("Error al exportar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const importProducts = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target?.result as string;
        const rows = parseCsv(content);
        
        if (rows.length === 0) {
          toast.error("El archivo está vacío o tiene formato inválido");
          setLoading(false);
          return;
        }

        setProgress({ total: rows.length, current: 0 });

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const productData = {
            tenant_id: tenantId!,
            name: row.name || row.nombre,
            sku: row.sku || null,
            barcode: row.barcode || row.codigo_barras || null,
            price: Number(row.price || row.precio || 0),
            cost: Number(row.cost || row.costo || 0),
            tax_rate: Number(row.tax_rate || row.iva || 0),
            min_stock: Number(row.min_stock || row.stock_minimo || 0),
            status: (row.status || "active") as any,
            unit_code: row.unit_code || "unit",
            product_type: (row.product_type || "simple") as any,
          };

          const id = row.id;
          if (id) {
            await supabase.from("products").update(productData).eq("id", id).eq("tenant_id", tenantId!);
          } else if (productData.sku) {
            // Upsert por SKU si no hay ID
            const { data: existing } = await supabase.from("products").select("id").eq("sku", productData.sku).eq("tenant_id", tenantId!).maybeSingle();
            if (existing) {
              await supabase.from("products").update(productData).eq("id", existing.id);
            } else {
              await supabase.from("products").insert(productData);
            }
          } else {
            await supabase.from("products").insert(productData);
          }

          setProgress(p => p ? { ...p, current: i + 1 } : null);
        }

        toast.success(`Importación finalizada: ${rows.length} productos procesados`);
        setProgress(null);
      };
      reader.readAsText(file);
    } catch (err: any) {
      toast.error("Error al importar: " + err.message);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const importInventory = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedCenterId) {
      toast.error("Debes seleccionar un centro de inventario");
      return;
    }

    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target?.result as string;
        const rows = parseCsv(content);
        
        setProgress({ total: rows.length, current: 0 });

        const { data: { user } } = await supabase.auth.getUser();

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const sku = row.sku;
          const qty = Number(row.quantity || row.cantidad || 0);

          if (!sku) continue;

          // Buscar producto por SKU
          const { data: product } = await supabase
            .from("products")
            .select("id")
            .eq("sku", sku)
            .eq("tenant_id", tenantId!)
            .maybeSingle();

          if (product) {
            // Obtener stock actual para calcular el ajuste
            const { data: stock } = await supabase
              .from("inventory_stocks")
              .select("quantity")
              .eq("product_id", product.id)
              .eq("inventory_center_id", selectedCenterId)
              .maybeSingle();

            const currentQty = Number(stock?.quantity || 0);
            const diff = qty - currentQty;

            if (diff !== 0) {
              await applyInventoryMovement({
                tenantId: tenantId!,
                branchId: branchId!,
                productId: product.id,
                inventoryCenterId: selectedCenterId,
                type: "adjustment",
                quantity: diff,
                reason: "Importación masiva de datos",
                userId: user?.id || "",
              });
            }
          }

          setProgress(p => p ? { ...p, current: i + 1 } : null);
        }

        toast.success(`Ajuste de inventario finalizado`);
        setProgress(null);
      };
      reader.readAsText(file);
    } catch (err: any) {
      toast.error("Error al importar inventario: " + err.message);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Catálogo de Productos */}
        <div className="glass rounded-2xl p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 text-brand-600">
              <FileSpreadsheet className="h-5 w-5" />
              <div className="g-title-16">Catálogo de Productos</div>
            </div>
            <div className="h-meta mt-1">
              Exporta o importa el listado completo de productos (precios, costos, categorías).
            </div>
          </div>
            <Button 
              variant="outline" 
              className="w-full justify-start gap-2 h-12"
              onClick={exportProducts}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar Catálogo (.csv)
            </Button>
            
            <div className="space-y-2">
              <Label htmlFor="import-products">Importar / Actualizar Catálogo</Label>
              <div className="relative">
                <Input 
                  id="import-products" 
                  type="file" 
                  accept=".csv" 
                  onChange={importProducts}
                  className="cursor-pointer"
                  disabled={loading}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                * Si incluyes la columna 'id', se actualizará el producto existente. 
                Si no, se intentará buscar por 'sku'.
              </p>
            </div>
        </div>

        {/* Stock de Inventario */}
        <div className="glass rounded-2xl p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 text-brand-600">
              <Box className="h-5 w-5" />
              <div className="g-title-16">Stock e Inventario</div>
            </div>
            <div className="h-meta mt-1">
              Ajusta masivamente las cantidades físicas en tus centros de inventario.
            </div>
          </div>
            <Button 
              variant="outline" 
              className="w-full justify-start gap-2 h-12"
              onClick={exportInventory}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar Stock Actual (.csv)
            </Button>

            <div className="space-y-3 pt-2 border-t">
              <div className="space-y-1.5">
                <Label>Centro destino para importación</Label>
                <Select value={selectedCenterId} onValueChange={setSelectedCenterId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un centro..." />
                  </SelectTrigger>
                  <SelectContent>
                    {centers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-inventory">Importar Stock (Ajuste Físico)</Label>
                <Input 
                  id="import-inventory" 
                  type="file" 
                  accept=".csv" 
                  onChange={importInventory}
                  className="cursor-pointer"
                  disabled={loading || !selectedCenterId}
                />
                <p className="text-[10px] text-muted-foreground">
                  * El archivo debe contener columnas 'sku' y 'quantity'. 
                  Se generará un movimiento de ajuste automáticamente.
                </p>
              </div>
            </div>
        </div>
      </div>

      {progress && (
        <Alert className="bg-primary/5 border-primary/20 animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <AlertTitle>Procesando datos...</AlertTitle>
          <AlertDescription>
            Procesando fila {progress.current} de {progress.total}
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Recomendación</AlertTitle>
        <AlertDescription>
          Realiza una exportación antes de importar datos masivamente para tener un respaldo de seguridad.
        </AlertDescription>
      </Alert>
    </div>
  );
}
