import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Loader2, Camera, Upload, Trash2, CheckCircle2, SkipForward } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { applyInventoryMovement } from "@/lib/inventory";

interface OCRProduct {
  name: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  total: number;
  mapped_product_id?: string;
  skipped?: boolean;
}

interface InvoiceMeta {
  supplier?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
}

export function InvoiceOCRDialog({ tenantId, branchId, userId, centers, defaultCenterId, onClose }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [products, setProducts] = useState<OCRProduct[]>([]);
  const [meta, setMeta] = useState<InvoiceMeta>({});
  const [centerId, setCenterId] = useState<string>(defaultCenterId || "");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: catalog = [] } = useQuery({
    queryKey: ["full-catalog-ocr", tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("products")
        .select("id, name, sku, barcode")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .order("name");
      return data ?? [];
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const fuzzyMatch = (invoiceName: string): string | undefined => {
    const norm = invoiceName.toLowerCase().trim();
    let match = (catalog as any[]).find(p =>
      p.name.toLowerCase() === norm || p.sku?.toLowerCase() === norm
    );
    if (match) return match.id;
    match = (catalog as any[]).find(p =>
      norm.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(norm)
    );
    if (match) return match.id;
    const firstWord = norm.split(" ")[0];
    if (firstWord.length > 3) {
      match = (catalog as any[]).find(p => p.name.toLowerCase().startsWith(firstWord));
    }
    return match?.id;
  };

  const processInvoice = async () => {
    if (!preview) return;
    setProcessing(true);
    try {
      const base64 = preview.split(",")[1];
      const mimeType = file?.type ?? "image/jpeg";
      const { data, error } = await supabase.functions.invoke("process-invoice", {
        body: { image: base64, mime_type: mimeType },
      });
      if (error) throw error;

      const mapped: OCRProduct[] = (data.products ?? []).map((p: OCRProduct) => ({
        ...p,
        mapped_product_id: fuzzyMatch(p.name),
        skipped: false,
      }));
      setProducts(mapped);
      setMeta({ supplier: data.supplier, invoice_number: data.invoice_number, invoice_date: data.invoice_date });

      const autoMapped = mapped.filter(p => p.mapped_product_id).length;
      toast.success(`${mapped.length} producto(s) extraídos`, {
        description: autoMapped > 0
          ? `${autoMapped} vinculados automáticamente`
          : "Vincula los productos manualmente",
      });
    } catch (err: any) {
      toast.error(`Error al procesar: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const updateMapping = (index: number, productId: string) => {
    setProducts(prev => prev.map((p, i) =>
      i === index ? { ...p, mapped_product_id: productId, skipped: false } : p
    ));
  };

  const toggleSkip = (index: number) => {
    setProducts(prev => prev.map((p, i) =>
      i === index
        ? { ...p, skipped: !p.skipped, mapped_product_id: p.skipped ? p.mapped_product_id : undefined }
        : p
    ));
  };

  const saveInventory = async () => {
    if (!centerId) return toast.error("Selecciona un centro de inventario");
    const toSave = products.filter(p => !p.skipped);
    const unmapped = toSave.filter(p => !p.mapped_product_id);
    if (unmapped.length > 0) return toast.error(`Vincula o salta ${unmapped.length} producto(s) sin mapear`);
    if (toSave.length === 0) return toast.error("No hay productos para guardar");

    setSaving(true);
    try {
      for (const p of toSave) {
        await applyInventoryMovement({
          tenantId, branchId, userId,
          productId: p.mapped_product_id!,
          inventoryCenterId: centerId,
          type: "purchase",
          quantity: p.quantity,
          reason: ["Factura IA", meta.supplier && `Proveedor: ${meta.supplier}`, meta.invoice_number && `#${meta.invoice_number}`]
            .filter(Boolean).join(" · "),
          referenceType: "ai_ocr",
        });
      }
      toast.success("Inventario actualizado", {
        description: `${toSave.length} movimiento(s) registrado(s)${products.length - toSave.length > 0 ? `, ${products.length - toSave.length} saltado(s)` : ""}`,
      });
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const mappedCount = products.filter(p => p.mapped_product_id && !p.skipped).length;
  const skippedCount = products.filter(p => p.skipped).length;
  const pendingCount = products.filter(p => !p.mapped_product_id && !p.skipped).length;

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Cargar Factura con IA (Gemini)
        </DialogTitle>
      </DialogHeader>

      {products.length === 0 ? (
        <div className="space-y-6 py-4">
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/20 rounded-xl p-12 bg-muted/5">
            {preview ? (
              <div className="relative group">
                <img src={preview} alt="Preview" className="max-h-64 rounded-lg shadow-md" />
                <Button variant="destructive" size="icon"
                  className="absolute -top-2 -right-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => { setFile(null); setPreview(null); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                  <Upload className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Sube una foto de tu factura de proveedor</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Gemini extrae productos, cantidades y precios automáticamente
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                    <Upload className="h-4 w-4 mr-2" /> Seleccionar archivo
                  </Button>
                  <Button onClick={() => fileInputRef.current?.click()} className="md:hidden">
                    <Camera className="h-4 w-4 mr-2" /> Tomar foto
                  </Button>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileChange}
                  accept="image/*" className="hidden" title="Subir factura" />
              </div>
            )}
          </div>
          <Button className="w-full h-12 text-base" disabled={!preview || processing} onClick={processInvoice}>
            {processing
              ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Analizando con Gemini...</>
              : "Analizar factura"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 py-2">
          {(meta.supplier || meta.invoice_number || meta.invoice_date) && (
            <Card className="p-3 flex flex-wrap gap-4 text-sm bg-muted/30">
              {meta.supplier && <span><span className="text-muted-foreground">Proveedor:</span> <strong>{meta.supplier}</strong></span>}
              {meta.invoice_number && <span><span className="text-muted-foreground">Factura #:</span> <strong>{meta.invoice_number}</strong></span>}
              {meta.invoice_date && <span><span className="text-muted-foreground">Fecha:</span> <strong>{meta.invoice_date}</strong></span>}
            </Card>
          )}

          <div className="max-w-xs">
            <Label className="text-xs mb-1.5 block">Centro de inventario</Label>
            <Select value={centerId} onValueChange={setCenterId}>
              <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
              <SelectContent>
                {centers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Producto (factura)</TableHead>
                  <TableHead>Producto en sistema</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Costo unit.</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p, idx) => (
                  <TableRow key={idx} className={p.skipped ? "opacity-40" : ""}>
                    <TableCell className="font-medium">
                      <div className="max-w-[160px] truncate" title={p.name}>{p.name}</div>
                      {p.unit && <div className="text-xs text-muted-foreground">{p.unit}</div>}
                    </TableCell>
                    <TableCell>
                      {p.skipped ? (
                        <span className="text-xs text-muted-foreground italic">Saltado</span>
                      ) : (
                        <Select value={p.mapped_product_id ?? ""} onValueChange={v => updateMapping(idx, v)}>
                          <SelectTrigger className={p.mapped_product_id ? "border-success/60" : "border-destructive/40"}>
                            <SelectValue placeholder="Vincular..." />
                          </SelectTrigger>
                          <SelectContent>
                            {(catalog as any[]).map((ep: any) => (
                              <SelectItem key={ep.id} value={ep.id}>
                                {ep.name}{ep.sku ? ` (${ep.sku})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(p.quantity).toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">${Number(p.unit_price).toLocaleString("es-CO")}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
                        title={p.skipped ? "Incluir" : "Saltar"} onClick={() => toggleSkip(idx)}>
                        <SkipForward className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between bg-muted/30 p-3 rounded-lg flex-wrap gap-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="h-4 w-4" /> {mappedCount} vinculados
              </span>
              {skippedCount > 0 && <Badge variant="secondary">{skippedCount} saltados</Badge>}
              {pendingCount > 0 && <Badge variant="destructive">{pendingCount} sin vincular</Badge>}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setProducts([])}>Volver</Button>
              <Button onClick={saveInventory} disabled={saving || pendingCount > 0 || !centerId || mappedCount === 0}>
                {saving
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando...</>
                  : `Cargar ${mappedCount} al inventario`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DialogContent>
  );
}
