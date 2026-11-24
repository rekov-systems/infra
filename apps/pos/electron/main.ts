/**
 * electron/main.ts
 * Proceso Principal (Main Process) de Electron para POS-S360T.
 *
 * Responsabilidades:
 * - Crear y gestionar la BrowserWindow principal
 * - Registrar todos los handlers IPC de hardware
 * - Gestionar el modo kiosco (habilitar/deshabilitar desde Admin)
 * - Gestionar la configuración de la app con electron-store
 * - Inicializar el auto-updater
 */

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AppSettings } from './types.js';
import { DEFAULT_SETTINGS, IPC_HANDLERS } from './types.js';
import { setupPrinterHandlers } from './services/printer.js';
import { setupBarcodeScanner, closeBarcodeScanner, restartBarcodeScanner } from './services/barcode.js';
import { setupUpdater } from './services/updater.js';
import { log } from './logger.js';

// ─── Paths ────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Electron Store (configuración persistente) ───────────────────────────────

// electron-store v8 usa require/import dinámico
let store: any = null;

async function initStore(): Promise<void> {
  const { default: ElectronStore } = await import('electron-store');
  store = new ElectronStore({
    name: 'pos-settings',
    defaults: DEFAULT_SETTINGS,
  });
}

function getSettings(): AppSettings {
  return store ? (store.store as AppSettings) : DEFAULT_SETTINGS;
}

// ─── Ventana Principal ────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(settings: AppSettings): BrowserWindow {
  const { kiosk } = settings;

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    // Kiosk mode: sin frame, fullscreen forzado
    kiosk,
    frame: !kiosk,
    fullscreen: kiosk,
    // Ocultar la barra de título en modo kiosco
    titleBarStyle: kiosk ? 'hidden' : 'default',
    backgroundColor: '#0f0f0f',
    show: false, // Mostrar cuando esté listo para evitar flash blanco
    icon: path.join(__dirname, '../public/favicon.ico'),
    webPreferences: {
      // SEGURIDAD: preload corre antes del renderer con acceso a APIs seguras
      preload: path.join(__dirname, 'preload.mjs'),
      // Aislamiento de contexto: el renderer NO puede acceder a Node.js
      contextIsolation: true,
      // Sin integración de Node.js en el renderer
      nodeIntegration: false,
      // Protección XSS adicional
      webSecurity: true,
      // Deshabilitar navegación externa no autorizada
      allowRunningInsecureContent: false,
    },
  });

  // Mostrar ventana cuando esté lista (evita el flash blanco)
  win.once('ready-to-show', () => {
    win.show();
    if (!kiosk && process.env.NODE_ENV === 'development') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Bloquear navegación a URLs externas en modo kiosco
  win.webContents.on('will-navigate', (event, url) => {
    const appUrl = process.env.VITE_DEV_SERVER_URL ?? `file://${path.join(__dirname, '../dist/index.html')}`;
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      if (!kiosk) shell.openExternal(url);
    }
  });

  // Cargar la app
  if (process.env.VITE_DEV_SERVER_URL) {
    // Dev: hot module replacement del servidor Vite
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // Producción: cargar el bundle compilado
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return win;
}

// ─── Handlers IPC Globales ────────────────────────────────────────────────────

function setupGlobalHandlers(): void {
  // ── Configuración ────────────────────────────────────────────────────────

  ipcMain.handle(IPC_HANDLERS.GET_SETTINGS, async () => {
    return getSettings();
  });

  ipcMain.handle(IPC_HANDLERS.SAVE_SETTINGS, async (_event, newSettings: Partial<AppSettings>) => {
    if (!store) return;
    const current = getSettings();
    const merged = { ...current, ...newSettings };

    // Merge profundo para objetos anidados
    if (newSettings.printer) merged.printer = { ...current.printer, ...newSettings.printer };
    if (newSettings.barcode) merged.barcode = { ...current.barcode, ...newSettings.barcode };

    store.set(merged);

    // Si cambió la configuración del escáner, reiniciar el servicio
    if (newSettings.barcode && mainWindow) {
      await restartBarcodeScanner(merged.barcode, mainWindow);
    }
  });

  // ── Modo Kiosco (Admin) ──────────────────────────────────────────────────

  ipcMain.handle(IPC_HANDLERS.SET_KIOSK, async (_event, enabled: boolean) => {
    if (!mainWindow) return;

    store?.set('kiosk', enabled);
    mainWindow.setKiosk(enabled);
    mainWindow.setFullScreen(enabled);
    mainWindow.setMenuBarVisibility(!enabled);

    log("info", "kiosk_mode_updated", { enabled });
  });

  // ── Utilidades ───────────────────────────────────────────────────────────

  ipcMain.handle(IPC_HANDLERS.OPEN_EXTERNAL, async (_event, url: string) => {
    // Validar que sea una URL HTTP(S) válida antes de abrirla
    if (/^https?:\/\/.+/.test(url)) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle(IPC_HANDLERS.GET_APP_VERSION, () => {
    return app.getVersion();
  });

  log("info", "ipc_handlers_registered");
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // 1. Inicializar el store de configuración
  await initStore();
  const settings = getSettings();
  log("info", "settings_loaded", { kiosk: settings.kiosk, printer: settings.printer, barcode: settings.barcode });

  // 2. Registrar handlers IPC globales (config, kiosk, utilidades)
  setupGlobalHandlers();

  // 3. Registrar handlers de impresora/gaveta
  setupPrinterHandlers(() => getSettings().printer);

  // 4. Crear la ventana principal
  mainWindow = createWindow(settings);

  // 5. Inicializar el escáner de barras
  mainWindow.once('ready-to-show', async () => {
    if (mainWindow) {
      await setupBarcodeScanner(settings.barcode, mainWindow);
    }
  });

  // 6. Configurar auto-updater (solo en producción)
  if (mainWindow) {
    await setupUpdater(mainWindow);
  }

  // 7. Limpiar recursos al cerrar
  mainWindow.on('closed', () => {
    closeBarcodeScanner();
    mainWindow = null;
  });
}

// ─── Lifecycle de Electron ────────────────────────────────────────────────────

// Una sola instancia de la app (previene múltiples ventanas)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log("error", "single_instance_lock_failed");
  app.quit();
} else {
  app.on('second-instance', () => {
    // Si el usuario intenta abrir otra instancia, enfocar la existente
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(bootstrap).catch((err) => {
  log("error", "bootstrap_failed", { error: err?.message ?? String(err) });
  dialog.showErrorBox(
    'Error al iniciar POS-S360T',
    `Error inesperado: ${err?.message ?? err}`
  );
  app.quit();
});

app.on('window-all-closed', () => {
  // En macOS se mantiene la app activa hasta que el usuario la cierre explícitamente
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // macOS: re-crear la ventana si el dock icon es clickeado y no hay ventanas
  if (BrowserWindow.getAllWindows().length === 0 && store) {
    mainWindow = createWindow(getSettings());
  }
});

app.on('before-quit', () => {
  closeBarcodeScanner();
});
