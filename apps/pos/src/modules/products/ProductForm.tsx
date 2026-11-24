import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RecipeEditor } from "./RecipeEditor";
import { toast } from "sonner";
import { useHardware } from "@/hooks/useHardware";
import { useBarcodeLookup } from "@/hooks/useBarcodeLookup";
import { ScanBarcode, Loader2, Globe, Plus, Trash2, GripVertical, ImagePlus, X } from "lucide-react";


const TYPES = ["simple", "composite", "production", "combo", "ingredient", "modifier"] as const;
const TYPE_LABELS: Record<string, string> = {
  simple: "Simple",
  composite: "Compuesto (Receta)",
  production: "Producción / Insumo",
  combo: "Combo / Paquete",
  ingredient: "Ingrediente / Materia Prima",
  modifier: "Modificador / Extra"
};
const COMPOUND = new Set(["composite", "production", "combo"]);
const KDS_STATIONS = ["Cocina", "Bar", "Parrilla", "Frío", "Postres"];

interface Props { tenantId: string; categories: any[]; editing: any; onClose: () => void }

function ModifierGroupEditor({ tenantId, productId }: { tenantId: string; productId: string }) {
  const qc = useQueryClient();
  const [newGroupName, setNewGroupName] = useState("");
  const [newRequired, setNewRequired] = useState(false);
  const [newMax, setNewMax] = useState(1);
  const [addingOption, setAddingOption] = useState<string | null>(null);
  const [optionName, setOptionName] = useState("");
  const [optionPrice, setOptionPrice] = useState("0");

  const { data: groups = [] } = useQuery({
    queryKey: ["modifier-groups", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data } = await supabase
        .from("modifier_groups")
        .select("*, modifier_options(*)")
        .eq("product_id", productId)
        .order("sort_order");
      return data ?? [];
    },
  });

  const addGroup = async () => {
    if (!newGroupName.trim()) return;
    const { error } = await supabase.from("modifier_groups").insert({
      tenant_id: tenantId,
      product_id: productId,
      name: newGroupName.trim(),
      required: newRequired,
      min_selections: newRequired ? 1 : 0,
      max_selections: newMax,
      sort_order: groups.length,
    });
    if (error) return toast.error(error.message);
    setNewGroupName("");
    setNewRequired(false);
    setNewMax(1);
    qc.invalidateQueries({ queryKey: ["modifier-groups", productId] });
  };

  const deleteGroup = async (id: string) => {
    await supabase.from("modifier_groups").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["modifier-groups", productId] });
  };

  const addOption = async (groupId: string) => {
    if (!optionName.trim()) return;
    const { error } = await supabase.from("modifier_options").insert({
      group_id: groupId,
      name: optionName.trim(),
      price_delta: Number(optionPrice) || 0,
    });
    if (error) return toast.error(error.message);
    setOptionName("");
    setOptionPrice("0");
    setAddingOption(null);
    qc.invalidateQueries({ queryKey: ["modifier-groups", productId] });
  };

  const deleteOption = async (id: string) => {
    await supabase.from("modifier_options").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["modifier-groups", productId] });
  };

  return (
    <div className="space-y-4">
      {/* Grupos existentes */}
      {groups.map((g: any) => (
        <div key={g.id} className="glass p-3 space-y-2 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">{g.name}</span>
              {g.required && <span className="g-pill g-pill-bad g-pill-h22">Obligatorio</span>}
              <span className="g-pill g-pill-ghost g-pill-h22">máx {g.max_selections}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => deleteGroup(g.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Opciones */}
          <div className="pl-6 space-y-1">
            {(g.modifier_options ?? []).map((o: any) => (
              <div key={o.id} className="flex items-center justify-between text-sm py-0.5">
                <span>{o.name}</span>
                <div className="flex items-center gap-2">
                  {o.price_delta !== 0 && (
                    <span className="text-xs text-muted-foreground">
                      {o.price_delta > 0 ? "+" : ""}${Number(o.price_delta).toLocaleString("es-CO")}
                    </span>
                  )}
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteOption(o.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}

            {addingOption === g.id ? (
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="Nombre opción"
                  value={optionName}
                  onChange={e => setOptionName(e.target.value)}
                  className="h-7 text-sm"
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOption(g.id); } }}
                />
                <Input
                  type="number"
                  placeholder="+ precio"
                  value={optionPrice}
                  onChange={e => setOptionPrice(e.target.value)}
                  className="h-7 text-sm w-24"
                />
                <Button size="sm" className="h-7 text-xs" onClick={() => addOption(g.id)}>OK</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => { setAddingOption(null); setOptionName(""); setOptionPrice("0"); }}>✕</Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                onClick={() => setAddingOption(g.id)}>
                <Plus className="h-3 w-3 mr-1" /> Agregar opción
              </Button>
            )}
          </div>
        </div>
      ))}

      {/* Nuevo grupo */}
      <div className="glass p-3 space-y-2 border-dashed">
        <p className="text-xs font-medium text-muted-foreground">Nuevo grupo de modificadores</p>
        <div className="flex gap-2">
          <Input
            placeholder="Nombre del grupo (ej. Adiciones)"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            className="h-8 text-sm"
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }}
          />
          <Input
            type="number"
            min="1"
            value={newMax}
            onChange={e => setNewMax(Number(e.target.value))}
            className="h-8 text-sm w-20"
            title="Máximo de selecciones"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch checked={newRequired} onCheckedChange={setNewRequired} id="req-switch" />
            <Label htmlFor="req-switch" className="text-xs">Obligatorio</Label>
          </div>
          <Button size="sm" onClick={addGroup} disabled={!newGroupName.trim()} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Crear grupo
          </Button>
        </div>
      </div>
    </div>
  );
}

function ComplementariesEditor({ tenantId, productId }: { tenantId: string; productId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: linked = [] } = useQuery({
    queryKey: ["complementaries", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data } = await supabase
        .from("product_complementaries")
        .select("complementary_id, products!complementary_id(id, name, price)")
        .eq("product_id", productId)
        .order("sort_order");
      return (data ?? []).map((r: any) => r.products).filter(Boolean);
    },
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["products-search-comp", tenantId, search],
    enabled: search.length > 1,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, price")
        .eq("tenant_id", tenantId).eq("status", "active")
        .neq("id", productId)
        .ilike("name", `%${search}%`)
        .limit(6);
      return data ?? [];
    },
  });

  const addComp = async (compId: string) => {
    if (linked.some((l: any) => l.id === compId)) return;
    await supabase.from("product_complementaries").insert({ product_id: productId, complementary_id: compId, sort_order: linked.length });
    qc.invalidateQueries({ queryKey: ["complementaries", productId] });
    setSearch("");
  };

  const removeComp = async (compId: string) => {
    await supabase.from("product_complementaries").delete()
      .eq("product_id", productId).eq("complementary_id", compId);
    qc.invalidateQueries({ queryKey: ["complementaries", productId] });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cuando se agrega este producto al carrito, el POS sugerirá estos complementarios.
      </p>
      <div className="space-y-1.5">
        <Label className="text-xs">Buscar producto para agregar</Label>
        <Input placeholder="Nombre del producto..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-sm" />
        {searchResults.length > 0 && (
          <div className="border rounded-lg divide-y">
            {searchResults.map((p: any) => (
              <button key={p.id} type="button"
                onClick={() => addComp(p.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between"
              >
                <span>{p.name}</span>
                <span className="text-xs text-muted-foreground"><Plus className="h-3 w-3" /></span>
              </button>
            ))}
          </div>
        )}
      </div>

      {linked.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Sin complementarios definidos.</p>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs">Complementarios actuales</Label>
          <div className="space-y-1">
            {linked.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 border rounded-lg text-sm">
                <span>{p.name}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => removeComp(p.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductForm({ tenantId, categories, editing, onClose }: Props) {
  const [form, setForm] = useState<any>(
    editing ?? { name: "", product_type: "simple", price: 0, cost: 0, tax_rate: 19, min_stock: 0, status: "active", category_id: null, sku: "", barcode: "", color: "#c2410c", station: null, description: "", sort_order: 0, image_url: null, requires_detail: false }
  );
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scanCleanupRef = useRef<(() => void) | null>(null);
  const { onBarcodeScanned } = useHardware();
  const { lookup: lookupBarcode, loading: lookingUp } = useBarcodeLookup();

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return toast.error("Solo se permiten imágenes JPEG, PNG o WebP");
    }
    if (file.size > 5 * 1024 * 1024) {
      return toast.error("La imagen no puede superar 5 MB");
    }
    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(path);
      setForm((f: any) => ({ ...f, image_url: publicUrl }));
      toast.success("Imagen subida correctamente");
    } catch (err: any) {
      toast.error(err.message ?? "Error al subir la imagen");
    } finally {
      setUploadingImage(false);
    }
  };

  useEffect(() => {
    if (editing) setForm(editing);
  }, [editing]);

  useEffect(() => () => { scanCleanupRef.current?.(); }, []);

  const fetchFromAPI = async () => {
    if (!form.barcode?.trim()) return;
    const product = await lookupBarcode(form.barcode);
    if (!product) return;
    setForm((f: any) => ({ ...f, name: f.name || product.title, sku: f.sku || product.brand || "" }));
    toast.success(`Encontrado: ${product.title}`, { description: product.brand || product.category });
  };

  const startScan = () => {
    setScanning(true);
    scanCleanupRef.current = onBarcodeScanned((code) => {
      setForm((f: any) => ({ ...f, barcode: code }));
      setScanning(false);
      scanCleanupRef.current?.();
      scanCleanupRef.current = null;
    });
    const timer = setTimeout(() => {
      setScanning(false);
      scanCleanupRef.current?.();
      scanCleanupRef.current = null;
    }, 15_000);
    const prev = scanCleanupRef.current;
    scanCleanupRef.current = () => { clearTimeout(timer); prev?.(); };
  };

  const showRecipe = COMPOUND.has(form.product_type) && !!editing?.id;
  const showModifiers = ["simple", "composite", "production", "combo"].includes(form.product_type) && !!editing?.id;
  const showComplementaries = !!editing?.id;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form, tenant_id: tenantId,
        price: Number(form.price), cost: Number(form.cost),
        tax_rate: Number(form.tax_rate), min_stock: Number(form.min_stock),
        station: form.station || null,
      };
      delete (payload as any).categories;
      delete (payload as any).modifier_groups;
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Producto actualizado");
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        toast.success("Producto creado. Vuelve a editarlo para añadir receta y modificadores.");
      }
      onClose();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{editing ? "Editar producto" : "Nuevo producto"}</DialogTitle></DialogHeader>

      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">Información</TabsTrigger>
          {showRecipe && <TabsTrigger value="recipe">Receta</TabsTrigger>}
          {showModifiers && <TabsTrigger value="modifiers">Modificadores</TabsTrigger>}
          {showComplementaries && <TabsTrigger value="complementaries">Upselling</TabsTrigger>}
        </TabsList>

        <TabsContent value="basic" className="mt-4">
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5"><Label>Nombre</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            {/* Foto del producto */}
            <div className="space-y-1.5">
              <Label>Foto del producto</Label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                aria-label="Subir foto del producto"
                title="Subir foto del producto"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
              />
              {form.image_url ? (
                <div className="relative w-full h-40 rounded-lg overflow-hidden border bg-muted">
                  <img src={form.image_url} alt="Foto del producto" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm((f: any) => ({ ...f, image_url: null }))}
                    className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                    title="Quitar imagen"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="w-full h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  {uploadingImage
                    ? <Loader2 className="h-6 w-6 animate-spin" />
                    : <ImagePlus className="h-6 w-6" />}
                  <span className="text-sm">{uploadingImage ? "Subiendo…" : "Clic para subir foto"}</span>
                  <span className="text-xs">JPEG, PNG o WebP · máx. 5 MB</span>
                </button>
              )}
              {form.image_url && (
                <Button type="button" variant="outline" size="sm" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}>
                  {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ImagePlus className="h-3.5 w-3.5 mr-1" />}
                  Cambiar foto
                </Button>
              )}
            </div>

            {/* Descripción para el menú */}
            <div className="space-y-1.5">
              <Label>Descripción <span className="text-muted-foreground font-normal">(visible en el menú QR)</span></Label>
              <Textarea
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ej: Hamburguesa doble con queso cheddar, lechuga y tomate..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={form.category_id ?? ""} onValueChange={(v) => setForm({ ...form, category_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.product_type} onValueChange={(v) => setForm({ ...form, product_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Precio</Label>
                <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Costo</Label>
                <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Imp. %</Label>
                <Input type="number" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>SKU</Label>
                <Input value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Stock mínimo</Label>
                <Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
              </div>
            </div>
            {/* Estación KDS */}
            <div className="space-y-1.5">
              <Label>Estación KDS</Label>
              <Select value={form.station ?? "none"} onValueChange={(v) => setForm({ ...form, station: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Sin asignar (Cocina por defecto)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {KDS_STATIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Código de barras (EAN)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Escribe o escanea el código..."
                  value={form.barcode ?? ""}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  className="font-mono"
                />
                <Button type="button" variant="outline" size="icon"
                  onClick={fetchFromAPI} disabled={lookingUp || !form.barcode?.trim()} title="Buscar info por EAN">
                  {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                </Button>
                <Button type="button" variant={scanning ? "default" : "outline"} size="icon"
                  onClick={startScan} disabled={scanning} title={scanning ? "Esperando…" : "Escanear"}>
                  {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Requiere detalle</Label>
                <p className="text-xs text-muted-foreground">Al agregar al pedido se solicita un comentario que va al KDS</p>
              </div>
              <Switch checked={!!form.requires_detail} onCheckedChange={(c) => setForm({ ...form, requires_detail: c })} />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <Label>Activo</Label>
              <Switch checked={form.status === "active"} onCheckedChange={(c) => setForm({ ...form, status: c ? "active" : "inactive" })} />
            </div>
            <Button type="submit" className="w-full h-12" disabled={saving}>
              {editing ? "Guardar cambios" : "Crear producto"}
            </Button>
          </form>
        </TabsContent>

        {showRecipe && (
          <TabsContent value="recipe" className="mt-4">
            <RecipeEditor tenantId={tenantId} parentProductId={editing.id} />
          </TabsContent>
        )}

        {showModifiers && (
          <TabsContent value="modifiers" className="mt-4">
            <p className="text-sm text-muted-foreground mb-3">
              Define grupos de extras u opciones que el cajero/mesero debe seleccionar al agregar este producto.
            </p>
            <ModifierGroupEditor tenantId={tenantId} productId={editing.id} />
          </TabsContent>
        )}

        {showComplementaries && (
          <TabsContent value="complementaries" className="mt-4">
            <ComplementariesEditor tenantId={tenantId} productId={editing.id} />
          </TabsContent>
        )}
      </Tabs>
    </DialogContent>
  );
}
