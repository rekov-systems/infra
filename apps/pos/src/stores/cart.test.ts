import { afterEach, describe, expect, it } from "vitest";
import { useCart, type CartProduct } from "./cart";

function product(overrides: Partial<CartProduct> = {}): CartProduct {
  return {
    id: "product-1",
    tenant_id: "tenant-1",
    name: "Café",
    price: 5000,
    tax_rate: 0,
    cost: 0,
    product_type: "simple",
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    barcode: null,
    category_id: null,
    color: null,
    image_url: null,
    min_stock: null,
    sku: null,
    unit_code: null,
    unit_id: null,
    rappi_product_id: null,
    station: null,
    ...overrides,
  };
}

describe("cart store", () => {
  afterEach(() => {
    useCart.getState().clear();
  });

  it("keeps the same product separated when modifier selections differ", () => {
    const base = product();

    useCart.getState().add(base);
    useCart.getState().add({
      ...base,
      price: 6500,
      _modifiers: [{ group_id: "milk", option_id: "almond", name: "Leche almendra", price_delta: 1500 }],
    });
    useCart.getState().add({
      ...base,
      price: 6500,
      _modifiers: [{ group_id: "milk", option_id: "almond", name: "Leche almendra", price_delta: 1500 }],
    });

    const state = useCart.getState();

    expect(state.lines).toHaveLength(2);
    expect(state.lines.find((line) => line.product._modifiers?.length)?.quantity).toBe(2);
    expect(state.total()).toBe(18000);
  });
});
