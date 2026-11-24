import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";

interface WhatsAppNotifsCtxValue {
  unreadCount: number;
  clearUnread: () => void;
}

const WhatsAppNotifsCtx = createContext<WhatsAppNotifsCtxValue>({
  unreadCount: 0,
  clearUnread: () => {},
});

export function useWhatsAppNotifs() {
  return useContext(WhatsAppNotifsCtx);
}

export function WhatsAppNotifsProvider({ children }: { children: React.ReactNode }) {
  const { tenantId } = useTenantContext();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`wa-notifs-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ai_messages",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.new?.direction !== "inbound") return;
          setUnreadCount((c) => c + 1);
          const preview = String(payload.new?.body ?? "");
          toast("📱 Nuevo mensaje de WhatsApp", {
            description: preview.length > 80 ? preview.slice(0, 80) + "…" : preview,
            action: { label: "Ver", onClick: () => { window.location.hash = "/whatsapp"; } },
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

  const clearUnread = useCallback(() => setUnreadCount(0), []);

  return (
    <WhatsAppNotifsCtx.Provider value={{ unreadCount, clearUnread }}>
      {children}
    </WhatsAppNotifsCtx.Provider>
  );
}
