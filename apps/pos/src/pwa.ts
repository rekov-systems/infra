import { registerSW } from "virtual:pwa-register";

type UpdateSWFn = (reloadPage?: boolean) => Promise<void>;

let updateSW: UpdateSWFn | undefined;

export function registerPWA() {
  if (typeof window === "undefined") return;

  // En Electron el shell controla el ciclo de vida y las actualizaciones
  // vía electron-updater, así que no registramos el Service Worker.
  if (window.electron) return;

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent("pwa:update-available"));
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent("pwa:offline-ready"));
    },
  });
}

export function applyPWAUpdate() {
  return updateSW?.(true);
}
