import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantStore } from "@/stores/tenant";
import { useBrandingStore } from "@/stores/branding";

export type ThemeKind = "bakery" | "bar";

export interface TenantConfig {
  id: string;
  name: string;
  domain: string | null;
  logo_url: string | null;
  primary_color: string | null;
  theme_kind: string | null;
}

export type DomainError = "not-found" | "error";

// Converts a 6-digit HEX color to HSL components (h s% l%)
function hexToHslString(hex: string): string {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6) return "0 0% 50%";

  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  const hDeg = Math.round(h * 360);
  const sPct = Math.round(s * 100);
  const lPct = Math.round(l * 100);
  return `${hDeg} ${sPct}% ${lPct}%`;
}

function applyBranding(config: TenantConfig): void {
  const root = document.documentElement;

  // Store the tenant primary color — ThemeApplier is the single writer of CSS vars
  useBrandingStore.getState().setPrimaryColor(config.primary_color ?? null);

  const kind: ThemeKind =
    config.theme_kind === "bakery" || config.theme_kind === "bar"
      ? config.theme_kind
      : "bar";

  root.dataset.tenantTheme = kind;
  document.title = config.name;
}

function resolveHostname(): string {
  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "demo.localhost";
  }
  return hostname;
}

export function useTenantByDomain() {
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DomainError | null>(null);
  const setTenant = useTenantStore((s) => s.setTenant);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const domain = resolveHostname();

      const { data, error: qErr } = await supabase
        .from("tenants")
        .select("id, name, domain, logo_url, primary_color, theme_kind")
        .eq("domain", domain)
        .maybeSingle();

      if (cancelled) return;

      if (qErr) {
        setError("error");
        setLoading(false);
        return;
      }

      if (!data) {
        setError("not-found");
        setLoading(false);
        return;
      }

      setTenant(data.id);
      applyBranding(data);
      setConfig(data);
      setLoading(false);
    }

    resolve();
    return () => { cancelled = true; };
  }, [setTenant]);

  return { config, loading, error };
}
