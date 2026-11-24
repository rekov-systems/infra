import { Link, Navigate } from "react-router-dom";
import { GearMark } from "@/components/shared/GearMark";
import { LiveDot } from "@/components/shared/LiveDot";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import {
  ShoppingCart, UtensilsCrossed, BarChart3, Wifi, Zap, Shield,
  Bike, ChefHat, Smartphone, Package, Receipt, TrendingUp,
  CheckCircle, ArrowRight, Star,
} from "lucide-react";

/* ── Features ── */
const FEATURES = [
  {
    icon: ShoppingCart,
    sc: "sc-blue",
    title: "Terminal POS táctil",
    desc: "Catálogo visual por categorías, búsqueda por EAN, gestión de tickets y cobro multi-método en una sola pantalla.",
  },
  {
    icon: UtensilsCrossed,
    sc: "sc-green",
    title: "Mesas & comandas",
    desc: "Toma de pedidos por mesa, estado en tiempo real, envío a cocina y cobro desde el salón.",
  },
  {
    icon: Bike,
    sc: "sc-purple",
    title: "Domicilios propios",
    desc: "Tablero kanban de pedidos a domicilio, asignación de repartidores y seguimiento de estado.",
  },
  {
    icon: Smartphone,
    sc: "sc-amber",
    title: "Pedidos digitales",
    desc: "Integración con Rappi, DiDi, Uber Eats y WhatsApp. Webhook en tiempo real, comisiones y neto calculado.",
  },
  {
    icon: ChefHat,
    sc: "sc-cyan",
    title: "KDS · Cocina",
    desc: "Display de cocina con alertas de tiempo, colores por urgencia y control de despacho ítem a ítem.",
  },
  {
    icon: Package,
    sc: "sc-lime",
    title: "Inventario & producción",
    desc: "Stocks por sucursal, movimientos, mermas, recetas y producción. Alertas de stock mínimo automáticas.",
  },
  {
    icon: BarChart3,
    sc: "sc-rose",
    title: "Reportes avanzados",
    desc: "Ventas por día, top productos, mix de medios de pago, IVA y exportación CSV.",
  },
  {
    icon: Wifi,
    sc: "sc-slate",
    title: "Offline-first",
    desc: "Funciona sin internet. Sincronización automática al recuperar la conexión. PWA instalable.",
  },
];

/* ── Stats ── */
const STATS = [
  { value: "5", unit: "canales", label: "de venta integrados" },
  { value: "∞", unit: "sucursales", label: "multi-sucursal" },
  { value: "100%", unit: "offline", label: "sin perder un ticket" },
  { value: "8", unit: "roles", label: "de acceso granular" },
];

/* ── Plans ── */
const PLANS = [
  {
    name: "Starter",
    price: "Gratis",
    sub: "Para empezar",
    features: ["1 sucursal", "Terminal POS", "Caja & ventas", "Reportes básicos"],
    cta: "Comenzar gratis",
    accent: false,
  },
  {
    name: "Pro",
    price: "$149k",
    sub: "COP / mes",
    features: ["Sucursales ilimitadas", "Todo Starter +", "Mesas & comandas", "Domicilios & KDS", "Pedidos digitales", "WhatsApp IA", "Inventario avanzado"],
    cta: "Empezar gratis 14 días",
    accent: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    sub: "Cotización",
    features: ["Todo Pro +", "SLA garantizado", "Onboarding dedicado", "Integraciones a medida"],
    cta: "Hablar con ventas",
    accent: false,
  },
];

export default function Landing() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ── Topbar ────────────────────────────────────────────── */}
      <header className="landing-topbar">
        <div className="landing-container flex items-center justify-between h-full">
          <div className="flex items-center gap-2.5">
            <GearMark size={28} />
            <span className="landing-logo-text">
              POS<span className="c-blue">360</span><span className="c-green">T</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Funciones</a>
            <a href="#planes" className="hover:text-foreground transition-colors">Planes</a>
            <a href="#contacto" className="hover:text-foreground transition-colors">Contacto</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
              Iniciar sesión
            </Link>
            <Link to="/auth" className="landing-btn-primary">
              Empezar gratis <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="landing-hero">
        {/* Background glows */}
        <div className="landing-glow-blue" />
        <div className="landing-glow-green" />
        <div className="absolute inset-0 s-grid-texture opacity-40 pointer-events-none" />

        {/* Gear watermark */}
        <div className="absolute -bottom-20 -right-20 opacity-[0.04] pointer-events-none hidden lg:block">
          <GearMark size={480} />
        </div>

        <div className="landing-container relative z-10 text-center">
          {/* Pill */}
          <div className="inline-flex items-center gap-2 s-pill s-pill-green mb-6">
            <LiveDot /> SISTEMA POS · S360T · v1.0
          </div>

          {/* Headline */}
          <h1 className="landing-hero-title">
            Tu venta como<br />
            <span className="gradient-text">sistema operativo.</span>
          </h1>

          <p className="landing-hero-sub">
            Multi-canal · Multi-sucursal · Offline-first.<br className="hidden sm:block" />
            Del mostrador al repartidor, del salón al dashboard.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Link to="/auth" className="landing-btn-primary landing-btn-lg">
              Empezar gratis — sin tarjeta <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#features" className="landing-btn-ghost landing-btn-lg">
              Ver funciones
            </a>
          </div>

          {/* Social proof */}
          <div className="flex items-center justify-center gap-6 mt-10 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-primary" /> Sin tarjeta requerida</span>
            <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-primary" /> 14 días gratis</span>
            <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-primary" /> Cancela cuando quieras</span>
          </div>
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────── */}
      <section className="landing-stats-bar">
        <div className="landing-container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-0 md:divide-x divide-border">
            {STATS.map(({ value, unit, label }) => (
              <div key={label} className="text-center px-6 py-4">
                <div className="landing-stat-value">{value} <span className="c-blue text-2xl">{unit}</span></div>
                <div className="text-sm text-muted-foreground mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────── */}
      <section id="features" className="landing-section">
        <div className="landing-container">
          <div className="text-center mb-12">
            <div className="eyebrow eyebrow-blue mb-3">FUNCIONALIDADES</div>
            <h2 className="landing-section-title">
              Todo lo que necesita tu negocio,<br />
              <span className="gradient-text">en una sola plataforma.</span>
            </h2>
            <p className="landing-section-sub">
              Desde la caja registradora hasta el inventario y los pedidos digitales.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map(({ icon: Icon, sc, title, desc }) => (
              <div key={title} className="landing-feature-card">
                <div className={`landing-feature-icon ${sc} sc-icon-bg`}>
                  <Icon className="h-5 w-5 sc-icon-color" strokeWidth={1.75} />
                </div>
                <h3 className="font-semibold text-base mt-4 mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Highlight row ─────────────────────────────────────── */}
      <section className="landing-section landing-highlight">
        <div className="landing-container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left copy */}
            <div>
              <div className="eyebrow eyebrow-blue mb-3">BRANDING BRUTAL</div>
              <h2 className="landing-section-title mb-4">
                Tres dispositivos,<br />
                <span className="gradient-text">un solo lenguaje.</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Navy profundo, azul de acción y verde signal. Tiles 100×100+ con glow al pulsar,
                eyebrows en uppercase tracked y gradiente highlight en el título clave.
                Pensado para tocar, mirar y operar.
              </p>
              <ul className="space-y-3">
                {[
                  { label: "Tablet · Terminal POS",        sub: "Catálogo + ticket + cobro en una pantalla" },
                  { label: "Móvil · Mesero / Repartidor",  sub: "Mesas con estado, comandas, domicilios"   },
                  { label: "Desktop · Dashboard operativo", sub: "KPIs, feed en vivo, KDS y reportes"       },
                ].map(({ label, sub }) => (
                  <li key={label} className="flex items-start gap-3">
                    <div className="h-5 w-5 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 mt-0.5">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                    <div>
                      <span className="font-semibold text-sm">{label}</span>
                      <p className="text-xs text-muted-foreground">{sub}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link to="/auth" className="landing-btn-primary landing-btn-lg mt-8 inline-flex">
                Ver demo <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Right: mock screens */}
            <div className="relative">
              {/* Desktop card */}
              <div className="landing-mock-card">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-success/70" />
                  <div className="flex-1 h-5 rounded bg-muted/60 mx-2" />
                </div>
                <div className="flex gap-3">
                  {/* Sidebar mock */}
                  <div className="w-16 space-y-1.5 shrink-0">
                    <div className="h-7 rounded-lg bg-muted/80" />
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className={`h-5 rounded bg-muted/${i === 0 ? "100" : "40"}`} />
                    ))}
                  </div>
                  {/* Content mock */}
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-14 rounded-xl bg-muted/60 border border-border" />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-8 rounded bg-muted/40" />
                      ))}
                    </div>
                    <div className="h-20 rounded-xl bg-primary/10 border border-primary/20" />
                  </div>
                </div>
              </div>

              {/* Mobile card floating */}
              <div className="landing-mock-mobile">
                <div className="space-y-2">
                  <div className="h-16 rounded-xl bg-primary/15 border border-primary/20" />
                  <div className="grid grid-cols-2 gap-1.5">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className={`h-14 rounded-lg border ${i === 2 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/50 border-border"}`} />
                    ))}
                  </div>
                  <div className="h-8 rounded-lg bg-primary/80" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Planes ────────────────────────────────────────────── */}
      <section id="planes" className="landing-section">
        <div className="landing-container">
          <div className="text-center mb-12">
            <div className="eyebrow eyebrow-blue mb-3">PLANES Y PRECIOS</div>
            <h2 className="landing-section-title">
              Crece con <span className="gradient-text">tu negocio.</span>
            </h2>
            <p className="landing-section-sub">Sin contratos anuales. Cancela cuando quieras.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {PLANS.map(({ name, price, sub, features, cta, accent }) => (
              <div key={name} className={`landing-plan-card ${accent ? "landing-plan-card-accent" : ""}`}>
                {accent && (
                  <div className="landing-plan-badge">
                    <Star className="h-3 w-3 fill-current" /> Más popular
                  </div>
                )}
                <div className="mb-6">
                  <div className="eyebrow mb-2">{name}</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black">{price}</span>
                    <span className="text-sm text-muted-foreground">{sub}</span>
                  </div>
                </div>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/auth"
                  className={accent ? "landing-btn-primary w-full justify-center" : "landing-btn-ghost w-full justify-center"}
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────── */}
      <section className="landing-section landing-cta-section">
        <div className="landing-container text-center relative z-10">
          <div className="eyebrow mb-4">¿LISTO PARA EMPEZAR?</div>
          <h2 className="landing-section-title mb-4">
            Empieza hoy —<br />
            <span className="gradient-text">gratis, sin tarjeta.</span>
          </h2>
          <p className="landing-section-sub mb-8">
            Configura tu primer negocio en menos de 5 minutos.
          </p>
          <Link to="/auth" className="landing-btn-primary landing-btn-lg">
            Crear cuenta gratis <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <GearMark size={22} />
              <span className="font-semibold text-sm">
                POS<span className="c-blue">360</span><span className="c-green">T</span>
              </span>
              <span className="text-muted-foreground text-xs">· Open Source</span>
            </div>
            <p className="text-xs text-muted-foreground">© 2026 POS S360T Contributors · Apache 2.0</p>
            <Link to="/auth" className="text-sm font-semibold text-primary hover:underline">
              Iniciar sesión →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
