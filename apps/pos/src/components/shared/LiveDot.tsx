import { cn } from "@/lib/utils";

type LiveDotKind = "green" | "blue" | "amber";

interface LiveDotProps {
  kind?: LiveDotKind;
  className?: string;
}

export function LiveDot({ kind = "green", className }: LiveDotProps) {
  return (
    <span
      className={cn(
        "live-dot",
        kind === "blue"  && "live-dot-blue",
        kind === "amber" && "live-dot-amber",
        className,
      )}
    />
  );
}
