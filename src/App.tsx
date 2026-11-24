import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persister } from './lib/queryClient';
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { TenantProvider } from "@/components/layout/TenantProvider";
import { PWAInstallPrompt } from "@/components/pwa/PWAInstallPrompt";
import { ThemeApplier } from "@/components/shared/ThemeApplier";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { useSyncEngine } from "@/hooks/useSyncEngine";
import { useAutoUpdater } from "@/hooks/useHardware";
import { OfflineBanner } from "@/components/shared/OfflineBanner";
import Auth from "./pages/Auth";
import Landing from "./pages/Landing";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import Forbidden from "./pages/Forbidden";

const Dashboard = lazy(() => import("./modules/dashboard/Dashboard"));
const POS = lazy(() => import("./modules/pos/POS"));
const Products = lazy(() => import("./modules/products/Products"));
const Categories = lazy(() => import("./modules/products/Categories"));
const Recipes = lazy(() => import("./modules/products/Recipes"));
const Inventory = lazy(() => import("./modules/inventory/Inventory"));
const Cash = lazy(() => import("./modules/cash/Cash"));
const Sales = lazy(() => import("./modules/sales/Sales"));
const Production = lazy(() => import("./modules/production/Production"));
const KDS = lazy(() => import("./modules/kds/KDS"));
const QRMenu = lazy(() => import("./pages/QRMenu"));
const WhatsAppInbox = lazy(() => import("./modules/whatsapp/WhatsAppInbox"));
const Reports = lazy(() => import("./modules/reports/Reports"));
const Employees = lazy(() => import("./modules/staff/Employees"));
const Shifts = lazy(() => import("./modules/staff/Shifts"));
const Branches = lazy(() => import("./modules/branches/Branches"));
const Catalog = lazy(() => import("./modules/catalog/Catalog"));
const ChannelPrices = lazy(() => import("./modules/channel-prices/ChannelPrices"));
const DigitalOrders = lazy(() => import("./modules/digital-orders/DigitalOrders"));
const Delivery = lazy(() => import("./modules/delivery/Delivery"));
const Settings = lazy(() => import("./modules/settings/Settings"));
const Tables = lazy(() => import("./modules/tables/Tables"));
const TableOrder = lazy(() => import("./modules/tables/TableOrder"));
const WaiterDashboard = lazy(() => import("./modules/waiter/WaiterDashboard"));
const CourierDashboard = lazy(() => import("./modules/courier/CourierDashboard"));
const Customers = lazy(() => import("./modules/customers/Customers"));
const Suppliers = lazy(() => import("./modules/suppliers/Suppliers"));
const Expenses = lazy(() => import("./modules/expenses/Expenses"));
const AIAgent  = lazy(() => import("./modules/ai-agent/AIAgent"));

const PageFallback = () => (
  <div className="min-h-screen grid place-items-center">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

const App = () => {
  useSyncEngine();
  useAutoUpdater();

  // PWA lifecycle feedback
  useEffect(() => {
    const onReady = () => toast.success("App lista para usar sin conexión ✓", { duration: 4000 });
    const onUpdate = () =>
      toast.info("Nueva versión disponible", {
        duration: 0,
        action: { label: "Actualizar", onClick: () => window.location.reload() },
      });
    window.addEventListener("pwa:offline-ready", onReady);
    window.addEventListener("pwa:update-available", onUpdate);
    return () => {
      window.removeEventListener("pwa:offline-ready", onReady);
      window.removeEventListener("pwa:update-available", onUpdate);
    };
  }, []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <TenantProvider>
        <TooltipProvider>
          <ThemeApplier />
          <Toaster />
          <Sonner richColors closeButton />
          <PWAInstallPrompt />
          <BrowserRouter>
            <OfflineBanner />
            <Suspense fallback={<PageFallback />}>
              <Routes>
                {/* ── Rutas públicas ── */}
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/403" element={<Forbidden />} />
                <Route path="/qr/:branchId" element={<QRMenu />} />

                {/* ── Rutas protegidas ── */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/onboarding" element={<Onboarding />} />
                  <Route path="/pos" element={<POS />} />
                  <Route path="/tables/:id" element={<TableOrder />} />
                  <Route element={<AppShell />}>
                    <Route path="/tables" element={<Tables />} />
                    <Route path="/waiter" element={<WaiterDashboard />} />
                    <Route path="/courier" element={<CourierDashboard />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/products" element={<Products />} />
                    <Route path="/categories" element={<Categories />} />
                    <Route path="/recipes" element={<Recipes />} />
                    <Route path="/catalog" element={<Catalog />} />
                    <Route path="/channel-prices" element={<ChannelPrices />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/cash" element={<Cash />} />
                    <Route path="/sales" element={<Sales />} />
                    <Route path="/production" element={<Production />} />
                    <Route path="/kds" element={<KDS />} />
                    <Route path="/digital-orders" element={<DigitalOrders />} />
                    <Route path="/whatsapp" element={<WhatsAppInbox />} />
                    <Route path="/delivery" element={<Delivery />} />
                    <Route path="/branches" element={<Branches />} />
                    <Route path="/employees" element={<Employees />} />
                    <Route path="/shifts" element={<Shifts />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/customers" element={<Customers />} />
                    <Route path="/suppliers" element={<Suppliers />} />
                    <Route path="/expenses" element={<Expenses />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/ai" element={<AIAgent />} />
                  </Route>
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </TenantProvider>
    </PersistQueryClientProvider>
  );
};

export default App;
