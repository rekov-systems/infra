const API_KEY = import.meta.env.VITE_BARCODE_LOOKUP_API_KEY;
const BASE_URL = "https://api.barcodelookup.com/v3/products";
const OFF_URL = "https://world.openfoodfacts.org/api/v2/product";

export interface BarcodeProduct {
  barcode_number: string;
  title: string;
  description: string;
  brand: string;
  category: string;
  manufacturer: string;
  images: string[];
  stores?: { store: string; currency: string; price: string }[];
}

async function lookupOpenFoodFacts(barcode: string): Promise<BarcodeProduct | null> {
  try {
    const res = await fetch(`${OFF_URL}/${encodeURIComponent(barcode)}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    return {
      barcode_number: barcode,
      title: p.product_name || p.product_name_es || "",
      description: p.ingredients_text || "",
      brand: p.brands || "",
      category: p.categories || "",
      manufacturer: p.manufacturing_places || "",
      images: p.image_url ? [p.image_url] : [],
    };
  } catch {
    return null;
  }
}

export async function lookupEAN(barcode: string): Promise<BarcodeProduct | null> {
  if (!API_KEY) {
    // Fallback gratuito: Open Food Facts (cubre EAN-13 de alimentos y muchos productos)
    return lookupOpenFoodFacts(barcode);
  }
  const url = `${BASE_URL}?barcode=${encodeURIComponent(barcode)}&formatted=y&key=${API_KEY}`;
  const res = await fetch(url);
  if (res.status === 404) return lookupOpenFoodFacts(barcode);
  if (res.status === 429) throw new Error("Límite de consultas alcanzado. Intenta más tarde.");
  if (!res.ok) throw new Error(`Error ${res.status} al consultar la API de códigos de barras.`);
  const data = await res.json();
  return (data.products as BarcodeProduct[])?.[0] ?? null;
}
