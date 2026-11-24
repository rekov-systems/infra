// Stub utilizado en builds de Electron donde vite-plugin-pwa no está activo.
// Reemplaza al módulo virtual `virtual:pwa-register` vía alias en vite.config.ts.
export function registerSW(_options?: unknown) {
  return async (_reloadPage?: boolean) => {
    /* no-op en Electron */
  };
}
