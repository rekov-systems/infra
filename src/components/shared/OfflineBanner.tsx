import { useEffect, useState } from "react";
import { useNetworkStore } from "@/stores/network";
import { SyncQueuePanel } from "./SyncQueuePanel";
import { WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type BannerState = "hidden" | "offline" | "syncing" | "done";

export function OfflineBanner() {
  const { isOnline, pendingSyncCount } = useNetworkStore();
  const [bannerState, setBannerState] = useState<BannerState>("hidden");
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setBannerState("offline");
      return;
    }

    if (pendingSyncCount > 0) {
      setBannerState("syncing");
      return;
    }

    // Was syncing and now count hit 0 → show "done" briefly
    if (bannerState === "syncing") {
      setBannerState("done");
      const t = setTimeout(() => setBannerState("hidden"), 3000);
      return () => clearTimeout(t);
    }

    setBannerState("hidden");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, pendingSyncCount]);

  if (bannerState === "hidden") return null;

  const configs = {
    offline: {
      bg: "bg-destructive",
      text: "text-destructive-foreground",
      icon: <WifiOff className="h-4 w-4 shrink-0" />,
      message: pendingSyncCount > 0
        ? `Sin conexión · ${pendingSyncCount} transacción${pendingSyncCount !== 1 ? "es" : ""} en cola`
        : "Sin conexión · Modo offline activo",
    },
    syncing: {
      bg: "bg-amber-500",
      text: "text-white",
      icon: <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />,
      message: `Sincronizando ${pendingSyncCount} transacción${pendingSyncCount !== 1 ? "es" : ""} pendiente${pendingSyncCount !== 1 ? "s" : ""}…`,
    },
    done: {
      bg: "bg-green-600",
      text: "text-white",
      icon: <CheckCircle2 className="h-4 w-4 shrink-0" />,
      message: "Sincronización completada",
    },
  } as const;

  const cfg = configs[bannerState];

  return (
    <>
      <button
        type="button"
        aria-label="Ver cola de sincronización"
        onClick={() => (bannerState !== "done" ? setPanelOpen(true) : undefined)}
        className={cn(
          "w-full flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-semibold",
          "transition-all duration-300 cursor-pointer select-none",
          cfg.bg,
          cfg.text,
          bannerState === "done" && "cursor-default",
        )}
      >
        {cfg.icon}
        <span>{cfg.message}</span>
        {bannerState !== "done" && (
          <span className="ml-1 underline underline-offset-2 text-xs font-normal opacity-80">
            Ver detalles
          </span>
        )}
      </button>

      <SyncQueuePanel open={panelOpen} onOpenChange={setPanelOpen} />
    </>
  );
}
