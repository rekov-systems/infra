import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { deskLoginUrl, isTenantHost } from "@/lib/host";

/** Marketing lives on desk.rekov.co. A business host only opens an existing session. */
export default function Landing() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user && isTenantHost()) {
    window.location.replace(deskLoginUrl(window.location.origin));
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <Navigate to={user ? "/dashboard" : "/auth"} replace />;
}
