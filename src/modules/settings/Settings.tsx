import { useState } from "react";
import BusinessSettings from "./BusinessSettings";
import BranchesSettings from "./BranchesSettings";
import UsersSettings from "./UsersSettings";
import TablesSettings from "./TablesSettings";
import SalesChannelsSettings from "./SalesChannelsSettings";
import ReceiptSettings from "./ReceiptSettings";
import AppearanceSettings from "./AppearanceSettings";
import WhatsAppSettings from "./WhatsAppSettings";
import AiAgentSettings from "./AiAgentSettings";
import { DataManagement } from "./DataManagement";
import { SystemMaintenance } from "./SystemMaintenance";
import { cn } from "@/lib/utils";
import {
  Building2, GitBranch, UtensilsCrossed, Users, Globe,
  MessageCircle, Bot, Receipt, Palette, Database, Wrench,
  ChevronRight,
} from "lucide-react";

const TABS = [
  { id: "business",   label: "Mi negocio",       icon: Building2 },
  { id: "branches",   label: "Sucursales",        icon: GitBranch },
  { id: "tables",     label: "Mesas",             icon: UtensilsCrossed },
  { id: "users",      label: "Usuarios y permisos", icon: Users },
  { id: "canales",    label: "Canales de venta",  icon: Globe },
  { id: "whatsapp",   label: "WhatsApp IA",       icon: MessageCircle },
  { id: "agente",     label: "Agente IA",         icon: Bot },
  { id: "receipt",    label: "Recibo",            icon: Receipt },
  { id: "apariencia", label: "Apariencia",        icon: Palette },
  { id: "datos",      label: "Datos",             icon: Database },
  { id: "ops",        label: "Operaciones",       icon: Wrench },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Settings() {
  const [active, setActive] = useState<TabId>("business");

  return (
    <div className="g-cfg-stage">
      {/* Left nav */}
      <div className="glass g-cfg-nav-panel">
        <div className="h-display g-cfg-nav-title">Configuración</div>
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={cn("g-cfg-nav-item", isActive && "is-active")}
              onClick={() => setActive(t.id)}
            >
              <Icon size={15} />
              <span className="flex-1 text-left">{t.label}</span>
              {isActive && <ChevronRight size={12} />}
            </button>
          );
        })}
        <div className="g-cfg-nav-hint glass-thin">
          Cambios aplicados en tiempo real a esta sucursal.
        </div>
      </div>

      {/* Content */}
      <div className="g-cfg-content">
        {active === "business"   && <BusinessSettings />}
        {active === "branches"   && <BranchesSettings />}
        {active === "tables"     && <TablesSettings />}
        {active === "users"      && <UsersSettings />}
        {active === "canales"    && <SalesChannelsSettings />}
        {active === "whatsapp"   && <WhatsAppSettings />}
        {active === "agente"     && <AiAgentSettings />}
        {active === "receipt"    && <ReceiptSettings />}
        {active === "apariencia" && <AppearanceSettings />}
        {active === "datos"      && <DataManagement />}
        {active === "ops"        && <SystemMaintenance />}
      </div>
    </div>
  );
}
