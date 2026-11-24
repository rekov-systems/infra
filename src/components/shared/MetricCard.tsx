import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  icon?: LucideIcon;
  label: string;
  value: string;
  /** Resalta con borde izquierdo de acento */
  accent?: boolean;
  /** Borde rojo — alerta */
  highlight?: boolean;
  hint?: string;
  delta?: string;
  /** Usa el estilo big-number (gradiente) en lugar de texto plano */
  bigNumber?: boolean;
}

export function MetricCard({ icon: Icon, label, value, accent, highlight, hint, delta, bigNumber }: MetricCardProps) {
  return (
    <div className={cn(
      "kpi-s360",
      accent && "kpi-s360-accent",
      highlight && "kpi-s360-warn"
    )}>
      {/* Eyebrow + icon row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="kpi-s360-eyebrow">{label}</div>
        {Icon && (
          <div className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
            accent ? "bg-primary/10" : "bg-muted"
          )}>
            <Icon className={cn("h-4 w-4", accent ? "text-primary" : "text-muted-foreground")} strokeWidth={1.75} />
          </div>
        )}
      </div>

      {/* Value */}
      {bigNumber
        ? <div className="big-number big-number-card">{value}</div>
        : <div className="kpi-s360-value">{value}</div>
      }

      {/* Delta / hint */}
      {(delta || hint) && (
        <div className="flex items-center gap-2 mt-1.5">
          {delta && <span className="kpi-s360-delta">{delta}</span>}
          {hint  && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
      )}

      {highlight && (
        <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/20">
          Requiere atención
        </div>
      )}
    </div>
  );
}
