import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { GearMark } from "@/components/shared/GearMark";

export default function Forbidden() {
  useEffect(() => {
    document.title = "Acceso Restringido (403) | POS S360T";
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 gap-6">
      <GearMark size={40} />

      <div className="w-full max-w-sm text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-destructive/10 border border-destructive/20 grid place-items-center">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>

        <div>
          <div className="eyebrow eyebrow-muted mb-2">ERROR 403</div>
          <h1 className="page-header-title">Acceso restringido</h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Tu rol actual no tiene permisos para abrir esta sección.
            Contacta al administrador si crees que es un error.
          </p>
        </div>

        <Button asChild className="w-full h-11">
          <Link to="/">
            <ArrowLeft className="h-4 w-4 mr-2" /> Volver al inicio
          </Link>
        </Button>
      </div>
    </div>
  );
}
