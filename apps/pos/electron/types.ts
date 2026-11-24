/**
 * electron/types.ts
 * Tipos compartidos para la comunicación IPC entre el Main Process y el Renderer.
 * Estos tipos son la "fuente de verdad" del contrato entre ambos procesos.
 */

// ─── Ticket / Impresora ─────────────────────────────────────────────────────

export interface TicketItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface TicketPayment {
  method: string;     // "Efectivo", "Tarjeta", "Transferencia", etc.
  amount: number;
}

export interface TicketData {
  ticketNumber: string | number;
  businessName: string;
  branchName?: string;
  address?: string;
  phone?: string;
  items: TicketItem[];
  subtotal: number;
  discountTotal: number;
  tipAmount: number;
  taxTotal: number;
  total: number;
  payments: TicketPayment[];
  customerName?: string;
  notes?: string;
  /** URL o texto plano para el QR al pie del ticket */
  qrData?: string;
  date?: string; // ISO string
}

export interface PrintResult {
  ok: boolean;
  error?: string;
}

// ─── Configuración Hardware ──────────────────────────────────────────────────

export type PrinterConnectionType = 'usb' | 'network' | 'bluetooth';

export interface PrinterConfig {
  connectionType: PrinterConnectionType;
  /** USB: '/dev/usb/lp0' (Linux) | '\\\\.\\COM3' (Windows) */
  devicePath?: string;
  /** Network/IP */
  host?: string;
  port?: number;
  /** Bluetooth MAC address */
  bluetoothAddress?: string;
  /** Ancho del papel en caracteres */
  width?: number;
  /** Character set ESC/POS */
  characterSet?: string;
}

export type BarcodeScannerMode = 'hid' | 'serial';

export interface BarcodeConfig {
  mode: BarcodeScannerMode;
  /** Serial: '/dev/ttyUSB0' | '/dev/ttyACM0' | '\\\\.\\COM4' */
  serialPort?: string;
  baudRate?: number;
}

// ─── Configuración Global de la App ─────────────────────────────────────────

export interface AppSettings {
  kiosk: boolean;
  printer: PrinterConfig;
  barcode: BarcodeConfig;
}

export const DEFAULT_SETTINGS: AppSettings = {
  kiosk: false,
  printer: {
    connectionType: 'usb',
    devicePath: process.platform === 'win32' ? '\\\\.\\COM1' : '/dev/usb/lp0',
    width: 42,
    characterSet: 'SLOVENIA',
  },
  barcode: {
    mode: 'hid',
    baudRate: 9600,
  },
};

// ─── Canales IPC ─────────────────────────────────────────────────────────────

/** Canales main → renderer */
export const IPC_EVENTS = {
  BARCODE_SCANNED: 'barcode-scanned',
  UPDATE_AVAILABLE: 'update-available',
  UPDATE_DOWNLOADED: 'update-downloaded',
  DOWNLOAD_PROGRESS: 'download-progress',
} as const;

/** Canales renderer → main (invoke) */
export const IPC_HANDLERS = {
  PRINT_TICKET: 'print-ticket',
  OPEN_DRAWER: 'open-drawer',
  GET_SETTINGS: 'get-settings',
  SAVE_SETTINGS: 'save-settings',
  SET_KIOSK: 'set-kiosk',
  INSTALL_UPDATE: 'install-update',
  OPEN_EXTERNAL: 'open-external',
  GET_APP_VERSION: 'get-app-version',
} as const;
