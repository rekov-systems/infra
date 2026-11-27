import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { GearMark } from "@/components/shared/GearMark";
import { toast } from "sonner";
import {
  Loader2, Shield, Zap, Wifi,
  ShoppingCart, MessageCircle, BarChart3,
} from "lucide-react";
import { deskLoginUrl, goToTenantSession, isTenantHost, tenantReturnOrigin } from "@/lib/host";

/* ── Left panel features ── */
const FEATURES = [
  { icon: Zap,           text: "Multicaja: cada puesto abre y cierra su propio turno" },
  { icon: Wifi,          text: "Sigue vendiendo sin conexión; sincroniza al volver" },
  { icon: Shield,        text: "Usuarios, permisos y datos aislados por negocio" },
];

/* ── Social proof stats ── */
const PROOF = [
  { icon: ShoppingCart,   label: "Multicaja",  value: "Por puesto" },
  { icon: MessageCircle, label: "Atención",  value: "WhatsApp" },
  { icon: BarChart3,      label: "Gestión", value: "Inventario y ventas" },
];

export default function Auth() {
  const navigate   = useNavigate();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    document.title = "Iniciar sesión | Desk";
    if (isTenantHost()) window.location.replace(deskLoginUrl(window.location.origin));
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const back = tenantReturnOrigin(new URLSearchParams(window.location.search).get("return"));
      if (back && data.session) {
        goToTenantSession(back, data.session.access_token, data.session.refresh_token);
        return;
      }
      toast.success("Bienvenido de vuelta");
      navigate("/onboarding", { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Error de autenticación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">

      {/* Desk style with the RMS features customers use after signing in. */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col relative overflow-hidden auth-panel-left">
        <div className="absolute inset-0 s-grid-texture pointer-events-none opacity-50" />
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full pointer-events-none auth-glow-blue" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full pointer-events-none auth-glow-green" />
        <div className="absolute -bottom-20 -right-20 opacity-[0.04] pointer-events-none">
          <GearMark size={420} />
        </div>

        <div className="relative z-10 flex flex-col h-full p-12">
          {/* Back link + logo */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GearMark size={34} />
              <div>
                <div className="auth-lockup-title">
                  Desk
                </div>
                <div className="auth-lockup-sub">Gestión comercial</div>
              </div>
            </div>
            <a href="https://desk.rekov.co" className="auth-back-link">
              Volver a Desk
            </a>
          </div>

          {/* Status pill */}
          <div className="mt-auto mb-auto pt-12">
            <h1 className="auth-hero-title">
              Gestiona tu negocio<br />
              <span className="gradient-text">desde un solo lugar.</span>
            </h1>
            <p className="auth-hero-sub">
              Caja, inventario y ventas conectados. Atiende y vende por WhatsApp, incluso cuando se cae internet.
            </p>

            {/* Features */}
            <div className="mt-8 space-y-3.5">
              {FEATURES.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <div className="auth-feature-icon">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm text-sidebar-foreground/70 leading-snug">{text}</p>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="mt-10 pt-8 border-t border-sidebar-border/30 grid grid-cols-3 gap-4">
              {PROOF.map(({ icon: Icon, label, value }) => (
                <div key={label} className="text-center">
                  <Icon className="h-4 w-4 text-primary/60 mx-auto mb-1" />
                  <div className="text-base font-black text-sidebar-foreground">{value}</div>
                  <div className="text-[10px] text-sidebar-foreground/40 leading-snug mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-sidebar-foreground/25 tracking-wider">
            © 2026 Rekov Systems · Software de código abierto
          </div>
        </div>
      </div>

      {/* ── Panel derecho: formulario ── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        <div className="w-full max-w-sm space-y-5">

          {/* Mobile brand + back link */}
          <div className="flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2.5">
              <GearMark size={28} />
              <div className="auth-lockup-title">Desk</div>
            </div>
            <a href="https://desk.rekov.co" className="auth-back-link">
              Desk
            </a>
          </div>

          {/* Form card */}
          <div className="glass p-7 rounded-3xl">
            <div className="mb-6">
              <div className="h-label g-auth-eyebrow mb-2">ACCESO OPERATIVO</div>
              <div className="h-display g-auth-title">Iniciar sesión</div>
              <div className="h-meta mt-1">Ingresa con tu cuenta de usuario autorizado.</div>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <Input
                  id="email" type="email" required
                  inputMode="email" autoComplete="email"
                  className="h-11 text-base"
                  placeholder="usuario@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pwd" className="text-sm font-medium">Contraseña</Label>
                <Input
                  id="pwd" type="password" required minLength={6}
                  autoComplete="current-password"
                  className="h-11 text-base"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="g-btn g-btn-primary g-btn-touch g-auth-submit w-full mt-2"
                disabled={loading}
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Verificando…</>
                  : "Entrar al sistema"
                }
              </button>
            </form>
          </div>

          {/* Mini proof */}
          <div className="grid grid-cols-3 gap-3 lg:hidden">
            {PROOF.map(({ icon: Icon, label, value }) => (
              <div key={label} className="glass-thin rounded-2xl p-3 text-center">
                <Icon className="h-3.5 w-3.5 mx-auto mb-1 g-auth-proof-icon" />
                <div className="g-auth-proof-val leading-tight">{value}</div>
                <div className="h-meta g-auth-proof-lbl leading-tight mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground/50 text-center">
            Acceso restringido · Reportar incidencias al administrador
          </p>
        </div>
      </div>
    </div>
  );
}
