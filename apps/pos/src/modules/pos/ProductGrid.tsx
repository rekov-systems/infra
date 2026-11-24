import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Product = Database["public"]["Tables"]["products"]["Row"];

const ROW_HEIGHT = 200;
const ROW_GAP    = 12;
const ROW_SIZE   = ROW_HEIGHT + ROW_GAP;

function colorToHue(color: string | null): string {
  if (!color) return "hue-default";
  const c = color.toLowerCase();
  if (/f59e|f97|fb9|amber|orange/.test(c)) return "hue-amber";
  if (/10b9|34d3|6ee7|059/.test(c)) return "hue-green";
  if (/7c3a|8b5c|a78b|violet|purple/.test(c)) return "hue-violet";
  if (/06b6|22d3|67e8|cyan|sky/.test(c)) return "hue-cyan";
  if (/f43f|fb71|fda4|rose/.test(c)) return "hue-rose";
  if (/84cc|a3e6|bef2|lime/.test(c)) return "hue-lime";
  if (/475|64748|94a3|slate|gray/.test(c)) return "hue-slate";
  return "hue-blue";
}

interface ProductGridProps {
  products:     Product[];
  stockMap?:    Record<string, number>;
  devMode?:     boolean;
  onSelect:     (p: Product) => void;
  thumbHeight?: number;
  columns?:     number;
}

export function ProductGrid({
  products,
  stockMap = {},
  devMode = false,
  onSelect,
  thumbHeight = 96,
  columns: columnsProp,
}: ProductGridProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const gridRef     = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0, scrollTop: 0 });

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const update = () =>
      setViewport({ width: node.clientWidth, height: node.clientHeight, scrollTop: node.scrollTop });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  /* Set --thumb-h CSS variable on scroll container so CSS can reference it */
  useLayoutEffect(() => {
    viewportRef.current?.style.setProperty("--thumb-h", `${thumbHeight}px`);
  }, [thumbHeight]);

  const cols = columnsProp ?? (
    viewport.width >= 1536 ? 6
    : viewport.width >= 1280 ? 5
    : viewport.width >= 960  ? 4
    : viewport.width >= 640  ? 3
    : 2
  );

  const totalRows = Math.ceil(products.length / cols);

  const visibleWindow = useMemo(() => {
    const overscan = 3;
    const startRow = Math.max(0, Math.floor(viewport.scrollTop / ROW_SIZE) - overscan);
    const endRow   = Math.min(totalRows, Math.ceil((viewport.scrollTop + viewport.height) / ROW_SIZE) + overscan);
    return {
      startIndex: startRow * cols,
      endIndex:   endRow * cols,
      top:        startRow * ROW_SIZE,
      bottom:     Math.max(0, (totalRows - endRow) * ROW_SIZE),
    };
  }, [cols, totalRows, viewport.height, viewport.scrollTop]);

  /* Apply dynamic grid layout + virtualization offsets directly on the DOM node */
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    el.style.paddingTop          = `${visibleWindow.top + 4}px`;
    el.style.paddingBottom       = `${visibleWindow.bottom + 4}px`;
  }, [cols, visibleWindow.top, visibleWindow.bottom]);

  const visible = products.slice(visibleWindow.startIndex, visibleWindow.endIndex);

  return (
    <div
      ref={viewportRef}
      className="flex-1 overflow-y-auto min-h-0"
      onScroll={(e) => {
        const node = e.currentTarget;
        setViewport((p) => ({ ...p, scrollTop: node.scrollTop }));
      }}
    >
      <div ref={gridRef} className="grid gap-3 px-0.5">
        {visible.map((p) => {
          const stock    = stockMap[p.id];
          const lowStock = typeof stock === "number" && p.min_stock != null && stock <= Number(p.min_stock);
          const hue      = colorToHue(p.color ?? null);

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className="product-tile hue-tile text-left"
            >
              {/* Thumb */}
              <div className={cn("tile-thumb hue-tile-thumb relative overflow-hidden", hue)}>
                <div className="tile-hatch" />
                <div className="tile-letter">{p.name.charAt(0).toUpperCase()}</div>
                {lowStock && (
                  <div className={cn("tile-low-stock", devMode && "!bg-orange-500/90")}>
                    {devMode ? "DEV" : (typeof stock === "number" ? `${Math.round(stock)}` : "")} STOCK
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="px-3 py-2.5">
                <div className="tile-name">{p.name}</div>
                <div className="flex items-baseline justify-between mt-1.5 gap-1">
                  <span className="tile-price">{formatCurrency(Number(p.price))}</span>
                  {typeof stock === "number" && (
                    <span className="tile-stock">{Math.round(stock)} {p.unit_code ?? ""}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {products.length === 0 && (
        <p className="text-center py-16 h-meta">No se encontraron productos</p>
      )}
    </div>
  );
}
