import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Category { id: string; name: string; color: string | null }

interface CategoryBarProps {
  categories: Category[];
  active: string | "all";
  onChange: (id: string | "all") => void;
  productCount?: number;
}

export function CategoryBar({ categories, active, onChange, productCount }: CategoryBarProps) {
  return (
    <ScrollArea className="w-full shrink-0">
      <div className="flex gap-2 py-1">
        <button
          type="button"
          onClick={() => onChange("all")}
          className={cn(
            "g-pill g-pill-h28 transition-all",
            active === "all" ? "g-pill-brand" : "g-pill-ghost"
          )}
        >
          Todos
          {productCount != null && (
            <span className="ml-1 text-[10px] opacity-70">{productCount}</span>
          )}
        </button>

        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={cn(
              "g-pill g-pill-h28 transition-all",
              active === c.id ? "g-pill-brand" : "g-pill-ghost"
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
