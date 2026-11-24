import { useState } from "react";
import { lookupEAN, type BarcodeProduct } from "@/lib/barcodeLookup";
import { toast } from "sonner";

export function useBarcodeLookup() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BarcodeProduct | null>(null);

  async function lookup(barcode: string): Promise<BarcodeProduct | null> {
    if (!barcode.trim()) return null;
    setLoading(true);
    try {
      const product = await lookupEAN(barcode.trim());
      setResult(product);
      if (!product) toast.info("Código no encontrado en la base de datos global.");
      return product;
    } catch (err: any) {
      toast.error(err.message ?? "Error al consultar la API de códigos de barras.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  function clear() { setResult(null); }

  return { lookup, loading, result, clear };
}
