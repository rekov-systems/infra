/**
 * src/lib/hardware.ts
 * Capa de detección de entorno y acceso al hardware.
 *
 * Exporta:
 * - `isElectron()` → true si corremos dentro de Electron
 * - `hardware` → acceso tipado a window.electron (o null en web)
 *
 * NUNCA uses window.electron directamente en los componentes.
 * Usa siempre el hook `useHardware()` para una experiencia React idiomática.
 */

import type { ElectronBridge } from '@/types/electron.d';
import type { TicketData, AppSettings } from '../../electron/types';

// Re-exportar para conveniencia
export type { TicketData, AppSettings };

// ─── Detección de entorno ─────────────────────────────────────────────────────

/**
 * Retorna true si el código corre dentro de una ventana de Electron.
 * Funciona verificando la existencia de window.electron (expuesto en preload.ts).
 */
export function isElectron(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.electron !== 'undefined' &&
    window.electron !== null
  );
}

/**
 * Acceso directo a la API del bridge. Puede ser null en la versión web.
 * Prefiere usar el hook useHardware() en componentes React.
 */
export const hardware: ElectronBridge | null = isElectron()
  ? (window.electron as ElectronBridge)
  : null;

// ─── Fallbacks para la versión WEB ───────────────────────────────────────────

/**
 * Imprime usando el diálogo de impresión del navegador.
 * Solo se invoca cuando NO estamos en Electron.
 */
export function webPrintFallback(): void {
  console.info('[Hardware] Impresora ESC/POS no disponible en versión web. Abriendo diálogo de impresión del navegador.');
  window.print();
}

/**
 * No-op para la gaveta en versión web.
 */
export function webDrawerFallback(): void {
  console.info('[Hardware] Gaveta de dinero no disponible en versión web (terminal física requerida).');
}

/**
 * No-op para el escáner en versión web.
 * Retorna una función de cleanup vacía para compatibilidad.
 */
export function webBarcodeListenerFallback(
  _callback: (code: string) => void
): () => void {
  console.info('[Hardware] Escáner de barras via IPC no disponible en versión web. El escáner HID puede funcionar a través de eventos de teclado nativos.');
  return () => {}; // cleanup vacío
}
