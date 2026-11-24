import { useEffect, useRef, useState } from "react";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { lookupEAN, type BarcodeProduct } from "@/lib/barcodeLookup";
import { applyInventoryMovement } from "@/lib/inventory";
import { supabase } from "@/integrations/supabase/client";
import { useHardware } from "@/hooks/useHardware";
import { toast } from "sonner";
import { ScanBarcode, Globe, Loader2, Plus, Trash2, CheckCircle, AlertCircle, PackagePlus } from "lucide-react";

interface Center { id: string; name: string }

interface EanLine {
  barcode: string;
  quantity: number;
  apiProduct: BarcodeProduct | null;
  existingProduct: { id: string; name: string } | null;
  newName: string;
  newSku: string;
  status: "idle" | "loading" | "found" | "new" | "notfound";
}

interface Props {
  tenantId: string;
  branchId: string;
  userId: string;
  centers: Center[];
  defaultCenterId?: string;
  existingProducts: { id: string; name: string; barcode?: string | null }[];
  onClose: () => void;
}

export function EanImportDialog({ tenantId, branchId, userId, centers, defaultCenterId, existingProducts, onClose }: Props) {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lines, setLines] = useState<EanLine[]>([]);
  const [centerId, setCenterId] = useState(defaultCenterId ?? "");
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanCleanup = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { onBarcodeScanned } = useHardware();

  // HID listener siempre activo mientras el diálogo está abierto
  useEffect(() => {
    const cleanup = onBarcodeScanned((code) => {
      addBarcode(code);
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startScan = () => {
    setScanning(true);
    // En modo serial/Bluetooth, activar por 15 s adicionales
    scanCleanup.current = onBarcodeScanned((code) => {
      setScanning(false);
      scanCleanup.current?.();
      scanCleanup.current = null;
      addBarcode(code);
    });
    const timer = setTimeout(() => {
      setScanning(false);
      scanCleanup.current?.();
      scanCleanup.current = null;
    }, 15_000);
    const prev = scanCleanup.current;
    scanCleanup.current = () => { clearTimeout(timer); prev?.(); };
  };

  const addBarcode = async (code: string) => {
    const barcode = code.trim();
    if (!barcode) return;

    if (lines.some(l => l.barcode === barcode)) {
      toast.info("Ese código ya está en la lista.");
      setBarcodeInput("");
      return;
    }

    const line: EanLine = {
      barcode, quantity: 1,
      apiProduct: null, existingProduct: null,
      newName: "", newSku: "", status: "loading",
    };
    setLines(prev => [...prev, line]);
    setBarcodeInput("");

    // Buscar en productos existentes primero
    const local = existingProducts.find(p => p.barcode === barcode);
    if (local) {
      setLines(prev => prev.map(l =>
        l.barcode === barcode ? { ...l, existingProduct: local, status: "found" } : l
      ));
      return;
    }

    // Consultar API global
    try {
      const apiResult = await lookupEAN(barcode);
      if (apiResult) {
        setLines(prev => prev.map(l =>
          l.barcode === barcode
            ? { ...l, apiProduct: apiResult, newName: apiResult.title, newSku: apiResult.brand, status: "new" }
            : l
        ));
      } else {
        setLines(prev => prev.map(l =>
          l.barcode === barcode ? { ...l, status: "notfound" } : l
        ));
      }
    } catch (err: any) {
      setLines(prev => prev.map(l =>
        l.barcode === barcode ? { ...l, status: "notfound" } : l
      ));
      toast.error(err?.message ?? "Error al consultar la API de códigos de barras.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addBarcode(barcodeInput); }
  };

  const removeLine = (barcode: string) =>
    setLines(prev => prev.filter(l => l.barcode !== barcode));

  const updateLine = (barcode: string, patch: Partial<EanLine>) =>
    setLines(prev => prev.map(l => l.barcode === barcode ? { ...l, ...patch } : l));

  const canSubmit = centerId && lines.length > 0 &&
    lines.every(l => l.status !== "loading" && l.quantity > 0 &&
      (l.existingProduct || (l.status === "new" && l.newName.trim())));

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      for (const line of lines) {
        let productId = line.existingProduct?.id;

        if (!productId && line.status === "new") {
          const { data, error } = await supabase.from("products").insert({
            tenant_id: tenantId,
            name: line.newName.trim(),
            sku: line.newSku.trim() || null,
            barcode: line.barcode,
            product_type: "simple",
            price: 0, cost: 0, tax_rate: 19, min_stock: 0,
            status: "active",
          }).select("id").single();
          if (error) throw new Error(`Error creando "${line.newName}": ${error.message}`);
          productId = data.id;
        }

        if (!productId) continue;

        await applyInventoryMovement({
          tenantId, branchId, userId, productId,
          inventoryCenterId: centerId,
          type: "purchase",
          quantity: line.quantity,
          reason: "Carga por código EAN",
          referenceType: "ean_import",
        });
      }

      const created = lines.filter(l => l.status === "new").length;
      const updated = lines.filter(l => l.status === "found").length;
      toast.success(`Inventario actualizado`, {
        description: `${created} producto(s) creado(s), ${updated} actualizado(s).`,
      });
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
      <DialogHeader className="px-6 pt-6 pb-4">
        <DialogTitle className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5" /> Cargar inventario por código EAN
        </DialogTitle>
      </DialogHeader>

      <div className="px-6 space-y-3 pb-4">
        {/* Centro de inventario */}
        <div className="space-y-1.5">
          <Label>Centro de inventario</Label>
          <Select value={centerId} onValueChange={setCenterId}>
            <SelectTrigger><SelectValue placeholder="Selecciona el centro..." /></SelectTrigger>
            <SelectContent>
              {centers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Input de código */}
        <div className="space-y-1.5">
          <Label>Código EAN / Código de barras</Label>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Digita o escanea el código y presiona Enter…"
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="font-mono"
              autoFocus
            />
            <Button type="button" variant="outline" size="icon"
              onClick={() => addBarcode(barcodeInput)}
              disabled={!barcodeInput.trim()}
              title="Agregar código"
            >
              <Globe className="h-4 w-4" />
            </Button>
            <Button type="button" variant={scanning ? "default" : "outline"} size="icon"
              onClick={startScan} disabled={scanning}
              title={scanning ? "Esperando lector…" : "Activar lector de barras"}
            >
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
            </Button>
          </div>
          {scanning && (
            <p className="text-xs text-muted-foreground animate-pulse">Apunta el lector al producto…</p>
          )}
        </div>
      </div>

      {/* Lista de líneas */}
      <div className="flex-1 overflow-y-auto px-6 space-y-2 min-h-0">
        {lines.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Agrega códigos EAN para buscar y cargar productos al inventario.
          </div>
        )}

        {lines.map(line => (
          <div key={line.barcode} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-muted-foreground">{line.barcode}</span>
                  {line.status === "loading" && <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Buscando…</Badge>}
                  {line.status === "found" && <Badge className="gap-1 bg-success text-success-foreground"><CheckCircle className="h-3 w-3" />En catálogo</Badge>}
                  {line.status === "new" && <Badge className="gap-1 bg-blue-500 text-white"><Plus className="h-3 w-3" />Nuevo producto</Badge>}
                  {line.status === "notfound" && <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />No encontrado</Badge>}
                </div>

                {line.status === "found" && (
                  <p className="text-sm font-medium mt-1">{line.existingProduct?.name}</p>
                )}

                {line.status === "new" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Nombre del producto</Label>
                      <Input
                        value={line.newName}
                        onChange={e => updateLine(line.barcode, { newName: e.target.value })}
                        placeholder="Nombre…"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Marca / SKU</Label>
                      <Input
                        value={line.newSku}
                        onChange={e => updateLine(line.barcode, { newSku: e.target.value })}
                        placeholder="Marca…"
                        className="h-8 text-sm"
                      />
                    </div>
                    {line.apiProduct?.description && (
                      <p className="col-span-2 text-xs text-muted-foreground line-clamp-2">{line.apiProduct.description}</p>
                    )}
                  </div>
                )}

                {line.status === "notfound" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Nombre del producto</Label>
                      <Input
                        value={line.newName}
                        onChange={e => updateLine(line.barcode, { newName: e.target.value, status: e.target.value ? "new" : "notfound" })}
                        placeholder="Escribe el nombre manualmente…"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">SKU / Marca</Label>
                      <Input
                        value={line.newSku}
                        onChange={e => updateLine(line.barcode, { newSku: e.target.value })}
                        placeholder="Opcional…"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="space-y-1 text-center">
                  <Label className="text-xs">Cantidad</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantity}
                    onChange={e => updateLine(line.barcode, { quantity: Number(e.target.value) })}
                    className="h-8 w-20 text-center text-sm"
                    disabled={line.status === "loading"}
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive mt-5"
                  onClick={() => removeLine(line.barcode)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {lines.length > 0 && (
        <>
          <Separator className="mt-4" />
          <div className="px-6 py-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {lines.filter(l => l.status === "new" || l.status === "notfound").length} nuevo(s) ·{" "}
              {lines.filter(l => l.status === "found").length} existente(s)
            </p>
            <Button onClick={submit} disabled={!canSubmit || saving} className="min-w-36">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PackagePlus className="h-4 w-4 mr-2" />}
              Cargar al inventario
            </Button>
          </div>
        </>
      )}
    </DialogContent>
  );
}
