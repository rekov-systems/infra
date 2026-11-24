/**
 * electron/services/barcode.ts
 * Servicio de lector de código de barras para el Main Process.
 *
 * Soporta DOS modos configurables por instancia (global settings):
 *
 * 1. HID (emulación de teclado) → el escáner escribe como si fuera teclado.
 *    En este modo el renderer maneja los eventos directamente (ver useHardware.ts).
 *    El main process no necesita hacer nada. Este servicio solo emite un log.
 *
 * 2. SERIAL (puerto COM/USB) → el escáner envía datos por puerto serie.
 *    El main process abre el puerto con `serialport`, lee líneas terminadas en \n,
 *    y emite el evento IPC 'barcode-scanned' al renderer.
 */

import { BrowserWindow } from 'electron';
import type { BarcodeConfig } from '../types.js';
import { IPC_EVENTS } from '../types.js';

let serialPortInstance: any = null;
let parserInstance: any = null;

// ─── Modo HID ────────────────────────────────────────────────────────────────

function setupHIDMode(): void {
  console.log('[Barcode] Modo HID activo. El renderer detecta el escáner como teclado.');
  // En modo HID, el renderer (useHardware.ts) usa un keydown listener
  // que detecta la secuencia rápida de caracteres + Enter típica de los scanners HID.
  // No se necesita hacer nada aquí en el main process.
}

// ─── Modo Serial ─────────────────────────────────────────────────────────────

async function setupSerialMode(
  config: BarcodeConfig,
  mainWindow: BrowserWindow
): Promise<void> {
  if (!config.serialPort) {
    console.warn('[Barcode] Modo serial sin serialPort configurado. Saltando.');
    return;
  }

  // Carga lazy para no bloquear arranque si el módulo nativo no compila
  try {
    const { SerialPort } = await import('serialport');
    const { ReadlineParser } = await import('@serialport/parser-readline');

    serialPortInstance = new SerialPort({
      path: config.serialPort,
      baudRate: config.baudRate ?? 9600,
      autoOpen: false,
    });

    parserInstance = serialPortInstance.pipe(new ReadlineParser({ delimiter: '\n' }));

    parserInstance.on('data', (line: string) => {
      const code = line.trim();
      if (!code) return;

      console.log('[Barcode] Código leído (serial):', code);

      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_EVENTS.BARCODE_SCANNED, code);
      }
    });

    serialPortInstance.open((err: Error | null) => {
      if (err) {
        console.error(`[Barcode] Error al abrir ${config.serialPort}:`, err.message);
      } else {
        console.log(`[Barcode] Puerto serie ${config.serialPort} abierto a ${config.baudRate ?? 9600} baud ✓`);
      }
    });

    serialPortInstance.on('error', (err: Error) => {
      console.error('[Barcode] Error en puerto serie:', err.message);
    });

  } catch (err) {
    console.error('[Barcode] No se pudo cargar serialport:', err);
    console.warn('[Barcode] Fallback a modo HID silencioso.');
  }
}

// ─── Cierre de Puerto Serie ───────────────────────────────────────────────────

export function closeBarcodeScanner(): void {
  if (serialPortInstance && serialPortInstance.isOpen) {
    serialPortInstance.close((err: Error | null) => {
      if (err) console.error('[Barcode] Error al cerrar puerto:', err.message);
      else console.log('[Barcode] Puerto serie cerrado.');
    });
    serialPortInstance = null;
    parserInstance = null;
  }
}

// ─── Setup Principal ─────────────────────────────────────────────────────────

export async function setupBarcodeScanner(
  config: BarcodeConfig,
  mainWindow: BrowserWindow
): Promise<void> {
  console.log(`[Barcode] Iniciando en modo: ${config.mode.toUpperCase()}`);

  if (config.mode === 'serial') {
    await setupSerialMode(config, mainWindow);
  } else {
    setupHIDMode();
  }
}

// ─── Re-inicializar con nueva config (desde Admin) ───────────────────────────

export async function restartBarcodeScanner(
  newConfig: BarcodeConfig,
  mainWindow: BrowserWindow
): Promise<void> {
  closeBarcodeScanner();
  await setupBarcodeScanner(newConfig, mainWindow);
}
