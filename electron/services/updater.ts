/**
 * electron/services/updater.ts
 * Auto-actualizaciones usando electron-updater.
 * Descarga desde GitHub Releases (o cualquier proveedor configurado en electron-builder).
 *
 * CONFIGURACIÓN:
 * Para habilitarlo, configura un proveedor publish real en electron-builder
 * y lanza la app con POS_ENABLE_AUTO_UPDATE=true.
 *
 * Ejemplo:
 *   "publish": {
 *     "provider": "github",
 *     "owner": "tu-usuario",
 *     "repo": "poss360t-releases"
 *   }
 */

import { ipcMain, BrowserWindow, dialog } from 'electron';
import { IPC_EVENTS, IPC_HANDLERS } from '../types.js';

let autoUpdater: any = null;

async function loadUpdater() {
  if (!autoUpdater) {
    try {
      const { autoUpdater: au } = await import('electron-updater');
      autoUpdater = au;
    } catch (err) {
      console.warn('[Updater] electron-updater no disponible:', err);
    }
  }
  return autoUpdater;
}

export async function setupUpdater(mainWindow: BrowserWindow): Promise<void> {
  const au = await loadUpdater();
  if (!au) return;

  // Solo verificar en producción (no en dev)
  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('[Updater] Modo dev detectado. Auto-updater deshabilitado.');
    return;
  }

  if (process.env.POS_ENABLE_AUTO_UPDATE !== 'true') {
    console.log('[Updater] Auto-updater deshabilitado: falta POS_ENABLE_AUTO_UPDATE=true.');
    return;
  }

  au.autoDownload = true;
  au.autoInstallOnAppQuit = true;

  // ── Eventos del updater → renderer ──────────────────────────────────────

  au.on('update-available', (info: any) => {
    console.log('[Updater] Actualización disponible:', info.version);
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_EVENTS.UPDATE_AVAILABLE, {
        version: info.version,
        releaseNotes: info.releaseNotes,
        releaseDate: info.releaseDate,
      });
    }
  });

  au.on('update-not-available', () => {
    console.log('[Updater] La app está actualizada.');
  });

  au.on('download-progress', (progress: any) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_EVENTS.DOWNLOAD_PROGRESS, {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  au.on('update-downloaded', (info: any) => {
    console.log('[Updater] Actualización descargada:', info.version);
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_EVENTS.UPDATE_DOWNLOADED, {
        version: info.version,
      });
    }
  });

  au.on('error', (err: Error) => {
    console.error('[Updater] Error:', err.message);
  });

  // ── Handler: instalar ahora ──────────────────────────────────────────────

  ipcMain.handle(IPC_HANDLERS.INSTALL_UPDATE, async () => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Instalar y reiniciar', 'Cancelar'],
      defaultId: 0,
      title: 'Actualización lista',
      message: 'La actualización está lista para instalar.',
      detail: 'La aplicación se reiniciará para completar la instalación.',
    });

    if (result.response === 0) {
      au.quitAndInstall(false, true);
    }
  });

  // ── Verificar al iniciar (con delay para no bloquear el render) ──────────

  setTimeout(() => {
    au.checkForUpdatesAndNotify().catch((err: Error) => {
      console.warn('[Updater] checkForUpdates falló:', err.message);
    });
  }, 5000);

  console.log('[Updater] Auto-updater configurado ✓');
}
