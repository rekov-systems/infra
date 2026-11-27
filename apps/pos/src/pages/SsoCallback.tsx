import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deskLoginUrl, isTenantHost } from "@/lib/host";

function missingSessionTarget() {
  if (isTenantHost()) return deskLoginUrl(window.location.origin);
  if (window.location.hostname === "desk.rekov.co") return "/login?next=%2Frms%2Fonboarding";
  return "/auth";
}

export default function SsoCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Conectando tu sesión…");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token || !refresh_token) {
        window.location.replace(missingSessionTarget());
        return;
      }
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (cancelled) return;
      if (error) {
        setMessage("La sesión expiró. Vuelve a iniciar sesión.");
        window.setTimeout(() => window.location.replace(missingSessionTarget()), 900);
        return;
      }
      const next = params.get("next") || new URLSearchParams(window.location.search).get("next");
      const destination = next?.startsWith("/rms/") ? next.slice(4) : "/onboarding";
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      navigate(destination || "/onboarding", { replace: true });
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  return <div className="min-h-screen grid place-items-center"><div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{message}</div></div>;
}
