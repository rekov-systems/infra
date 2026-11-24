/**
 * src/hooks/useHardware.ts
 * Hook React principal para interactuar con el hardware local del POS.
 *
 * Características:
 * - Funciona en WEB (fallback elegante) y en ELECTRON (hardware real).
 * - Maneja el modo HID del escáner directamente con un keydown listener.
 * - Maneja el modo SERIAL del escáner via IPC (evento del main process).
 * - Expone `isAvailable` para que los componentes ajusten su UI.
 *
 * Uso básico:
 * ```tsx
 * const { printTicket, openDrawer, onBarcodeScanned, isAvailable } = useHardware();
 *
 * // Imprimir
 * const result = await printTicket(ticketData);
 * if (!result.ok) toast.error(result.error);
 *
 * // Escuchar escáner
 * useEffect(() => {
 *   return onBarcodeScanned((code) => buscarProducto(code));
 * }, []);
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  isElectron,
  hardware,
  webPrintFallback,
  webDrawerFallback,
  webBarcodeListenerFallback,
  type TicketData,
  type AppSettings,
} from '@/lib/hardware';

// ─── HID Barcode Detection ────────────────────────────────────────────────────

/**
 * Constantes del detector de escáner HID.
 * Los escáneres HID tipean el código muy rápido (< HID_MAX_CHAR_MS por carácter)
 * y terminan con Enter. Esto los distingue del tipeo humano.
 */
const HID_MAX_CHAR_MS = 50;    // Máximo ms entre caracteres (escáner vs humano)
const HID_MIN_LENGTH = 4;      // Longitud mínima de un código de barras válido

/**
 * Configura el listener global para escáneres en modo HID (emulación de teclado).
 * Se activa en cualquier entorno (web o Electron) para el modo HID.
 */
function setupHIDListener(
  callback: (code: string) => void
): () => void {
  let buffer = '';
  let lastTime = 0;

  const onKeyDown = (e: KeyboardEvent) => {
    const now = Date.now();
    const timeDelta = now - lastTime;
    lastTime = now;

    // Enter = fin de secuencia del escáner
    if (e.key === 'Enter') {
      if (buffer.length >= HID_MIN_LENGTH) {
        const code = buffer.trim();
        if (code) {
          callback(code);
          // Prevenir que el Enter dispare submit de formularios
          e.preventDefault();
          e.stopPropagation();
        }
      }
      buffer = '';
      return;
    }

    // Ignorar teclas especiales (Shift, Ctrl, etc.)
    if (e.key.length !== 1) return;

    // Si el tiempo entre teclas es mayor al umbral, el usuario está tipeando
    if (buffer.length > 0 && timeDelta > HID_MAX_CHAR_MS) {
      // Resetear: es tipeo humano, no un escáner
      buffer = e.key;
    } else {
      buffer += e.key;
    }
  };

  document.addEventListener('keydown', onKeyDown, true);
  return () => document.removeEventListener('keydown', onKeyDown, true);
}

// ─── Tipos del Hook ───────────────────────────────────────────────────────────

interface PrintResult {
  ok: boolean;
  error?: string;
}

interface UseHardwareReturn {
  /** true si corremos en Electron con hardware disponible */
  isAvailable: boolean;
  /** true mientras se procesa una impresión */
  isPrinting: boolean;
  /**
   * Imprime un ticket en la impresora térmica.
   * En web: abre el diálogo de impresión del navegador.
   */
  printTicket: (data: TicketData) => Promise<PrintResult>;
  /**
   * Abre la gaveta de dinero.
   * En web: muestra una advertencia.
   */
  openDrawer: () => Promise<PrintResult>;
  /**
   * Registra un callback para códigos de barras detectados.
   * Soporta HID (teclado) y Serial (IPC).
   * Retorna la función de cleanup.
   */
  onBarcodeScanned: (callback: (code: string) => void) => () => void;
  /** Obtiene la configuración de hardware (solo en Electron) */
  getSettings: () => Promise<AppSettings | null>;
  /** Guarda la configuración de hardware (solo en Electron) */
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>;
  /** Activa/desactiva el modo kiosco (solo Admin en Electron) */
  setKiosk: (enabled: boolean) => Promise<void>;
  /** Versión de la app (solo en Electron) */
  appVersion: string | null;
}

// ─── Hook Principal ───────────────────────────────────────────────────────────

export function useHardware(): UseHardwareReturn {
  const [isPrinting, setIsPrinting] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const available = isElectron();

  // Obtener la versión al montar
  useEffect(() => {
    if (available && hardware) {
      hardware.getAppVersion().then(setAppVersion).catch(() => {});
    }
  }, [available]);

  // ── printTicket ──────────────────────────────────────────────────────────

  const printTicket = useCallback(
    async (data: TicketData): Promise<PrintResult> => {
      if (!available || !hardware) {
        // Fallback web
        webPrintFallback();
        return { ok: true };
      }

      setIsPrinting(true);
      try {
        const result = await hardware.printTicket(data);
        if (!result.ok) {
          toast.error(`Error de impresora: ${result.error ?? 'Error desconocido'}`);
        }
        return result;
      } catch (err: any) {
        const error = err?.message ?? 'Error inesperado';
        toast.error(`Error de impresora: ${error}`);
        return { ok: false, error };
      } finally {
        setIsPrinting(false);
      }
    },
    [available]
  );

  // ── openDrawer ───────────────────────────────────────────────────────────

  const openDrawer = useCallback(async (): Promise<PrintResult> => {
    if (!available || !hardware) {
      webDrawerFallback();
      toast.warning('Gaveta de dinero solo disponible en la terminal física.');
      return { ok: false, error: 'Hardware no disponible en versión web' };
    }

    try {
      return await hardware.openDrawer();
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Error al abrir gaveta' };
    }
  }, [available]);

  // ── onBarcodeScanned ─────────────────────────────────────────────────────

  const onBarcodeScanned = useCallback(
    (callback: (code: string) => void): (() => void) => {
      if (!available || !hardware) {
        // En web: solo HID (el usuario tiene teclado, el escáner también emula teclado)
        webBarcodeListenerFallback(callback);
        // Aun así configuramos el listener HID por si el escáner está conectado
        return setupHIDListener(callback);
      }

      // En Electron: ambos modos en paralelo

      // 1. HID: siempre activo (cubre el caso más común)
      const cleanupHID = setupHIDListener(callback);

      // 2. Serial IPC: activo si el main process emite eventos (modo serial)
      const cleanupSerial = hardware.onBarcodeScanned(callback);

      // Retornar cleanup combinado
      return () => {
        cleanupHID();
        cleanupSerial();
      };
    },
    [available]
  );

  // ── Settings ─────────────────────────────────────────────────────────────

  const getSettings = useCallback(async (): Promise<AppSettings | null> => {
    if (!available || !hardware) return null;
    return hardware.getSettings();
  }, [available]);

  const saveSettings = useCallback(async (settings: Partial<AppSettings>): Promise<void> => {
    if (!available || !hardware) {
      console.warn('[Hardware] saveSettings no disponible en versión web.');
      return;
    }
    await hardware.saveSettings(settings);
  }, [available]);

  // ── Kiosk ────────────────────────────────────────────────────────────────

  const setKiosk = useCallback(async (enabled: boolean): Promise<void> => {
    if (!available || !hardware) {
      console.warn('[Hardware] setKiosk no disponible en versión web.');
      return;
    }
    await hardware.setKiosk(enabled);
    toast.success(`Modo kiosco ${enabled ? 'activado' : 'desactivado'}.`);
  }, [available]);

  return {
    isAvailable: available,
    isPrinting,
    printTicket,
    openDrawer,
    onBarcodeScanned,
    getSettings,
    saveSettings,
    setKiosk,
    appVersion,
  };
}

// ─── Hook de notificaciones de actualización ──────────────────────────────────

/**
 * Hook separado para manejar el UI de actualizaciones.
 * Escucha los eventos del auto-updater y muestra toasts.
 *
 * Úsalo en App.tsx o en un componente Layout de nivel alto.
 */
export function useAutoUpdater(): void {
  const available = isElectron();

  useEffect(() => {
    if (!available || !hardware) return;

    const cleanupAvailable = hardware.onUpdateAvailable(({ version }) => {
      toast.info(`Nueva versión disponible: v${version}. Descargando…`, {
        duration: 5000,
      });
    });

    const cleanupDownloaded = hardware.onUpdateDownloaded(({ version }) => {
      toast.success(`v${version} descargada. ¿Instalar ahora?`, {
        action: {
          label: 'Instalar y reiniciar',
          onClick: () => hardware?.installUpdate(),
        },
        duration: Infinity,
      });
    });

    return () => {
      cleanupAvailable();
      cleanupDownloaded();
    };
  }, [available]);
}
