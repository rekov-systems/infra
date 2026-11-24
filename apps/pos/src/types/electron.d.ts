/**
 * src/types/electron.d.ts
 * Declaraciones de tipos para window.electron en el renderer.
 * Esto le dice a TypeScript que window.electron existe y cuál es su forma.
 * Solo se llena en runtime cuando corremos dentro de Electron.
 */

import type { TicketData, AppSettings } from '../../electron/types';

export interface ElectronBridge {
  /** Imprime un ticket en la impresora térmica ESC/POS */
  printTicket: (data: TicketData) => Promise<{ ok: boolean; error?: string }>;

  /** Envía el pulso eléctrico para abrir la gaveta de dinero */
  openDrawer: () => Promise<{ ok: boolean; error?: string }>;

  /**
   * Registra un callback para códigos de barras detectados via puerto serial.
   * Retorna una función de cleanup (para usar en useEffect).
   */
  onBarcodeScanned: (callback: (code: string) => void) => () => void;

  /** Obtiene la configuración actual de la app */
  getSettings: () => Promise<AppSettings>;

  /** Guarda la configuración de la app */
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>;

  /**
   * Activa o desactiva el modo kiosco.
   * Solo disponible para el rol Admin.
   */
  setKiosk: (enabled: boolean) => Promise<void>;

  /** Instala la actualización descargada y reinicia la app */
  installUpdate: () => Promise<void>;

  /** Escucha el evento de actualización disponible */
  onUpdateAvailable: (
    callback: (info: { version: string; releaseNotes?: string }) => void
  ) => () => void;

  /** Escucha el progreso de descarga de la actualización */
  onDownloadProgress: (
    callback: (progress: { percent: number; bytesPerSecond: number }) => void
  ) => () => void;

  /** Escucha cuando la actualización está lista para instalar */
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;

  /** Abre una URL en el navegador del sistema */
  openExternal: (url: string) => Promise<void>;

  /** Versión de la app desde package.json */
  getAppVersion: () => Promise<string>;

  /** 'linux' | 'darwin' | 'win32' */
  platform: NodeJS.Platform;
}

declare global {
  interface Window {
    /**
     * API del puente Electron/Renderer.
     * Solo existe cuando la app corre dentro de Electron.
     * Usa `isElectron()` o `useHardware()` para verificar disponibilidad.
     */
    electron?: ElectronBridge;
  }
}

export {};
