import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="p-12 text-center">
      <div className="h-14 w-14 rounded-2xl bg-muted grid place-items-center mx-auto mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="font-semibold text-lg">{title}</h2>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}
