/**
 * electron/services/printer.ts
 * Servicio de impresora térmica ESC/POS para el Main Process.
 * Soporta conexión por USB, Red/IP y Bluetooth.
 * Usa la librería node-thermal-printer.
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { TicketData, PrintResult, PrinterConfig } from '../types.js';
import { IPC_HANDLERS, DEFAULT_SETTINGS } from '../types.js';

// Importamos de forma lazy para que el app arranque aunque la impresora no esté conectada
let ThermalPrinter: any;
let PrinterTypes: any;
let CharacterSet: any;

async function loadPrinterLibrary() {
  if (!ThermalPrinter) {
    try {
      const lib = await import('node-thermal-printer');
      ThermalPrinter = lib.ThermalPrinter;
      PrinterTypes = lib.PrinterTypes;
      CharacterSet = lib.CharacterSet;
    } catch (err) {
      console.error('[Printer] No se pudo cargar node-thermal-printer:', err);
      throw new Error('Librería de impresora no disponible');
    }
  }
}

// ─── Builder de Ticket ──────────────────────────────────────────────────────

function buildInterface(config: PrinterConfig): string {
  switch (config.connectionType) {
    case 'network':
      return `tcp://${config.host ?? '192.168.1.100'}:${config.port ?? 9100}`;
    case 'bluetooth':
      return config.bluetoothAddress ?? '';
    case 'usb':
    default:
      return config.devicePath ?? DEFAULT_SETTINGS.printer.devicePath!;
  }
}

async function createPrinterInstance(config: PrinterConfig): Promise<any> {
  await loadPrinterLibrary();

  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: buildInterface(config),
    width: config.width ?? 42,
    characterSet: CharacterSet[config.characterSet ?? 'SLOVENIA'] ?? CharacterSet.SLOVENIA,
    removeSpecialCharacters: false,
    options: { timeout: 5000 },
  });

  return printer;
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function padLine(left: string, right: string, width: number): string {
  const spaces = width - left.length - right.length;
  return left + ' '.repeat(Math.max(spaces, 1)) + right;
}

// ─── Impresión de Ticket ────────────────────────────────────────────────────

export async function printTicket(
  config: PrinterConfig,
  data: TicketData
): Promise<PrintResult> {
  try {
    const printer = await createPrinterInstance(config);
    const width = config.width ?? 42;
    const separator = '─'.repeat(width);
    const date = data.date ? new Date(data.date) : new Date();
    const dateStr = date.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const timeStr = date.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // ── Encabezado ──────────────────────────────────────────────────────────
    printer.alignCenter();
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(data.businessName.toUpperCase());
    printer.bold(false);
    printer.setTextNormal();

    if (data.branchName) printer.println(data.branchName);
    if (data.address) printer.println(data.address);
    if (data.phone) printer.println(`Tel: ${data.phone}`);

    printer.drawLine();
    printer.alignLeft();
    printer.println(
      padLine(`Ticket #${data.ticketNumber}`, `${dateStr} ${timeStr}`, width)
    );
    if (data.customerName) printer.println(`Cliente: ${data.customerName}`);
    printer.drawLine();

    // ── Items ────────────────────────────────────────────────────────────────
    for (const item of data.items) {
      const qtyName = `${item.quantity}x ${item.name}`;
      const totalStr = formatCurrency(item.total);
      // Nombre truncado si es muy largo
      const maxNameLen = width - totalStr.length - 2;
      const displayName = qtyName.length > maxNameLen
        ? qtyName.substring(0, maxNameLen - 1) + '…'
        : qtyName;
      printer.println(padLine(displayName, totalStr, width));

      // Precio unitario si la cantidad es > 1
      if (item.quantity > 1) {
        printer.println(`   @ ${formatCurrency(item.unitPrice)} c/u`);
      }
    }

    printer.drawLine();

    // ── Totales ──────────────────────────────────────────────────────────────
    printer.println(padLine('Subtotal', formatCurrency(data.subtotal), width));

    if (data.discountTotal > 0) {
      printer.println(padLine('Descuento', `-${formatCurrency(data.discountTotal)}`, width));
    }
    if (data.taxTotal > 0) {
      printer.println(padLine('IVA', formatCurrency(data.taxTotal), width));
    }
    if (data.tipAmount > 0) {
      printer.println(padLine('Propina', formatCurrency(data.tipAmount), width));
    }

    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(padLine('TOTAL', formatCurrency(data.total), width));
    printer.bold(false);
    printer.setTextNormal();

    // ── Pagos ────────────────────────────────────────────────────────────────
    if (data.payments.length > 0) {
      printer.drawLine();
      printer.println('Forma de pago:');
      for (const pay of data.payments) {
        printer.println(padLine(`  ${pay.method}`, formatCurrency(pay.amount), width));
      }

      // Calcular cambio
      const totalPaid = data.payments.reduce((s, p) => s + p.amount, 0);
      const change = totalPaid - data.total;
      if (change > 0.005) {
        printer.bold(true);
        printer.println(padLine('Cambio', formatCurrency(change), width));
        printer.bold(false);
      }
    }

    // ── Notas ────────────────────────────────────────────────────────────────
    if (data.notes) {
      printer.drawLine();
      printer.alignCenter();
      printer.println(data.notes);
    }

    // ── QR Code ──────────────────────────────────────────────────────────────
    if (data.qrData) {
      printer.newLine();
      printer.alignCenter();
      printer.printQR(data.qrData, {
        size: 8,
        model: 2,
        error: 'M',
      });
    }

    // ── Pie ──────────────────────────────────────────────────────────────────
    printer.newLine();
    printer.alignCenter();
    printer.println('¡Gracias por su preferencia!');
    printer.newLine();

    // Feed y corte
    printer.cut();

    const success = await printer.execute();
    if (!success) {
      return { ok: false, error: 'La impresora no respondió al comando' };
    }

    return { ok: true };
  } catch (err: any) {
    console.error('[Printer] Error al imprimir:', err);
    return { ok: false, error: err?.message ?? 'Error desconocido al imprimir' };
  }
}

// ─── Apertura de Gaveta ──────────────────────────────────────────────────────

export async function openCashDrawer(config: PrinterConfig): Promise<PrintResult> {
  try {
    const printer = await createPrinterInstance(config);

    // Pulso estándar ESC/POS para gaveta (pin 2 del conector)
    // \x1B\x70 = ESC p | \x00 = pin 2 | \x19\xFA = pulso on/off time
    printer.raw(Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]));
    await printer.execute();

    return { ok: true };
  } catch (err: any) {
    console.error('[Drawer] Error al abrir gaveta:', err);
    return { ok: false, error: err?.message ?? 'Error al abrir gaveta' };
  }
}

// ─── Registro de Handlers IPC ────────────────────────────────────────────────

export function setupPrinterHandlers(getConfig: () => PrinterConfig): void {
  ipcMain.handle(IPC_HANDLERS.PRINT_TICKET, async (_event, data: TicketData) => {
    return printTicket(getConfig(), data);
  });

  ipcMain.handle(IPC_HANDLERS.OPEN_DRAWER, async () => {
    return openCashDrawer(getConfig());
  });

  console.log('[Printer] Handlers IPC registrados ✓');
}
