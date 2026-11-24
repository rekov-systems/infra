/**
 * electron/preload.ts
 * Script de precarga que corre en el contexto del renderer ANTES que la página.
 * Expone una API segura y tipada al frontend mediante contextBridge.
 *
 * SEGURIDAD:
 * - contextIsolation: true → el código de la página no puede acceder a Node.js.
 * - nodeIntegration: false → sin acceso directo a módulos Node en el renderer.
 * - Solo se exponen las funciones explícitamente declaradas aquí.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { TicketData, AppSettings } from './types.js';
import { IPC_EVENTS, IPC_HANDLERS } from './types.js';

// ─── API expuesta como window.electron ───────────────────────────────────────

const electronAPI = {
  // ── Impresora / Gaveta ─────────────────────────────────────────────────

  /**
   * Imprime un ticket en la impresora térmica configurada.
   * @returns { ok: boolean, error?: string }
   */
  printTicket: (data: TicketData) =>
    ipcRenderer.invoke(IPC_HANDLERS.PRINT_TICKET, data),

  /**
   * Envía el pulso ESC/POS para abrir la gaveta de dinero.
   * @returns { ok: boolean, error?: string }
   */
  openDrawer: () =>
    ipcRenderer.invoke(IPC_HANDLERS.OPEN_DRAWER),

  // ── Escáner de Código de Barras ────────────────────────────────────────

  /**
   * Registra un callback que se invoca cuando se detecta un código de barras
   * via el puerto serie (modo SERIAL). Para modo HID, ver useHardware.ts.
   * @returns función de cleanup para quitar el listener
   */
  onBarcodeScanned: (callback: (code: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, code: string) => callback(code);
    ipcRenderer.on(IPC_EVENTS.BARCODE_SCANNED, handler);
    // Retorna función de cleanup
    return () => ipcRenderer.removeListener(IPC_EVENTS.BARCODE_SCANNED, handler);
  },

  // ── Configuración Global ───────────────────────────────────────────────

  /**
   * Obtiene la configuración de la app (impresora, escáner, kiosk).
   */
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC_HANDLERS.GET_SETTINGS),

  /**
   * Guarda la configuración de la app.
   */
  saveSettings: (settings: Partial<AppSettings>): Promise<void> =>
    ipcRenderer.invoke(IPC_HANDLERS.SAVE_SETTINGS, settings),

  /**
   * Activa o desactiva el modo kiosco.
   * (Habilitable/deshabilitado desde el panel de Admin)
   */
  setKiosk: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC_HANDLERS.SET_KIOSK, enabled),

  // ── Auto-actualizaciones ───────────────────────────────────────────────

  /** Instala la actualización descargada y reinicia la app. */
  installUpdate: () =>
    ipcRenderer.invoke(IPC_HANDLERS.INSTALL_UPDATE),

  /** Escucha cuando hay una actualización disponible. */
  onUpdateAvailable: (
    callback: (info: { version: string; releaseNotes?: string }) => void
  ): (() => void) => {
    const handler = (_: any, info: any) => callback(info);
    ipcRenderer.on(IPC_EVENTS.UPDATE_AVAILABLE, handler);
    return () => ipcRenderer.removeListener(IPC_EVENTS.UPDATE_AVAILABLE, handler);
  },

  /** Escucha el progreso de descarga de la actualización. */
  onDownloadProgress: (
    callback: (progress: { percent: number; bytesPerSecond: number }) => void
  ): (() => void) => {
    const handler = (_: any, progress: any) => callback(progress);
    ipcRenderer.on(IPC_EVENTS.DOWNLOAD_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_EVENTS.DOWNLOAD_PROGRESS, handler);
  },

  /** Escucha cuando la actualización ha sido descargada y está lista para instalar. */
  onUpdateDownloaded: (
    callback: (info: { version: string }) => void
  ): (() => void) => {
    const handler = (_: any, info: any) => callback(info);
    ipcRenderer.on(IPC_EVENTS.UPDATE_DOWNLOADED, handler);
    return () => ipcRenderer.removeListener(IPC_EVENTS.UPDATE_DOWNLOADED, handler);
  },

  // ── Utilidades ─────────────────────────────────────────────────────────

  /** Abre una URL en el navegador externo del sistema. */
  openExternal: (url: string) =>
    ipcRenderer.invoke(IPC_HANDLERS.OPEN_EXTERNAL, url),

  /** Retorna la versión actual de la app (desde package.json). */
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke(IPC_HANDLERS.GET_APP_VERSION),

  /** Plataforma del SO: 'linux' | 'darwin' | 'win32' */
  platform: process.platform as NodeJS.Platform,
};

// Expone la API bajo window.electron
contextBridge.exposeInMainWorld('electron', electronAPI);

// Tipado para TypeScript en el renderer (ver src/types/electron.d.ts)
export type ElectronAPI = typeof electronAPI;
