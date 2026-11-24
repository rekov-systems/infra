import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  /** Pequeño texto en mayúsculas sobre el título */
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  divider?: boolean;
  className?: string;
}

export function PageHeader({ title, eyebrow, description, actions, divider = false, className }: PageHeaderProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="page-header">
        <div className="min-w-0">
          {eyebrow && <div className="page-header-eyebrow">{eyebrow}</div>}
          <h1 className="page-header-title">{title}</h1>
          {description && (
            <p className="page-header-desc">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {divider && <div className="s-divider" />}
    </div>
  );
}
