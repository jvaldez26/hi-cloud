// ESC/POS Bluetooth Thermal Printer — 58mm (32 chars/line)
// Web Bluetooth API: Chrome/Edge on Android + HTTPS only.

const CARACTERES_POR_LINEA = 32;

const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '00001101-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

// Module-level BT state (device object is not serializable)
let btDevice: any = null;
let btChar: any   = null;

// ── Format helpers ─────────────────────────────────────────────────────────────

export function envolver(texto: string, maxLen = CARACTERES_POR_LINEA): string[] {
  const palabras = texto.split(' ');
  const lineas: string[] = [];
  let linea = '';
  for (const p of palabras) {
    if (!linea) { linea = p; continue; }
    if (linea.length + 1 + p.length <= maxLen) { linea += ' ' + p; }
    else { lineas.push(linea); linea = p; }
  }
  if (linea) lineas.push(linea);
  return lineas.length ? lineas : [''];
}

export function centrar(texto: string, ancho = CARACTERES_POR_LINEA): string {
  const txt = texto.slice(0, ancho);
  const pad = Math.max(0, Math.floor((ancho - txt.length) / 2));
  return ' '.repeat(pad) + txt;
}

export function lineaLR(izq: string, der: string, ancho = CARACTERES_POR_LINEA): string {
  const maxIzq = ancho - der.length - 1;
  const i = izq.length > maxIzq ? izq.slice(0, maxIzq - 1) + '…' : izq;
  const espacio = ancho - i.length - der.length;
  return i + ' '.repeat(Math.max(1, espacio)) + der;
}

export function separador(char = '-', ancho = CARACTERES_POR_LINEA): string {
  return char.repeat(ancho);
}

// ── ESC/POS command builder ────────────────────────────────────────────────────

function comandos() {
  const bufs: Uint8Array[] = [];
  const b = (...bytes: number[]) => bufs.push(new Uint8Array(bytes));
  const t = (txt: string) => bufs.push(new TextEncoder().encode(txt + '\n'));

  const api = {
    init()            { b(0x1B, 0x40); return api; },
    alignCenter()     { b(0x1B, 0x61, 0x01); return api; },
    alignLeft()       { b(0x1B, 0x61, 0x00); return api; },
    bold(on: boolean) { b(0x1B, 0x45, on ? 1 : 0); return api; },
    doble(on: boolean){ b(0x1D, 0x21, on ? 0x11 : 0x00); return api; },
    texto(txt: string){ t(txt); return api; },
    salto(n = 1)      { for (let i = 0; i < n; i++) b(0x0A); return api; },
    cortar()          { b(0x1D, 0x56, 0x42, 0x00); return api; },
    build(): Uint8Array {
      const total = bufs.reduce((s, a) => s + a.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const a of bufs) { out.set(a, off); off += a.length; }
      return out;
    },
  };
  return api;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EmpresaBT {
  nombre?:    string;
  rnc?:       string;
  direccion?: string;
  telefono?:  string;
}

export interface SaleBT {
  folio?:                  string;
  total:                   number;
  cambio?:                 number;
  metodo?:                 string;
  items:                   Array<{ produto: { nombre: string }; cantidad: number; precio: number }>;
  iva?:                    number;
  subtotal?:               number;
  encf?:                   string;
  ecfPendiente?:           boolean;
  cajero?:                 string;
  cliente?:                string;
  fechaEmision?:           string;
  horaEmision?:            string;
  empresaNombreComercial?: string;
  empresaRnc?:             string;
  empresaDireccion?:       string;
  empresaTelefono?:        string;
}

// ── Receipt generator ──────────────────────────────────────────────────────────

function fmtMonto(n: number): string {
  return n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generarReciboESCPOS(sale: SaleBT, empresa: EmpresaBT): Uint8Array {
  const nombreEmp = empresa.nombre ?? sale.empresaNombreComercial ?? 'HiCloud POS';
  const rncEmp    = empresa.rnc    ?? sale.empresaRnc    ?? '';
  const dirEmp    = empresa.direccion ?? sale.empresaDireccion ?? '';
  const telEmp    = empresa.telefono  ?? sale.empresaTelefono  ?? '';

  const fecha = sale.fechaEmision ?? new Date().toLocaleDateString('es-DO');
  const hora  = sale.horaEmision  ?? new Date().toLocaleTimeString('es-DO');

  const c = comandos().init();

  // Header
  c.alignCenter();
  c.bold(true).doble(true).texto(centrar(nombreEmp)).doble(false).bold(false);
  if (rncEmp) c.texto(centrar(`RNC: ${rncEmp}`));
  if (dirEmp) { for (const l of envolver(dirEmp)) c.texto(centrar(l)); }
  if (telEmp) c.texto(centrar(`Tel: ${telEmp}`));
  c.salto(1);

  c.alignLeft();
  c.texto(separador());

  c.texto(lineaLR('Fecha:', fecha));
  c.texto(lineaLR('Hora:', hora));
  if (sale.cajero)  c.texto(lineaLR('Cajero:', sale.cajero.slice(0, 18)));
  if (sale.cliente) c.texto(lineaLR('Cliente:', sale.cliente.slice(0, 18)));
  if (sale.folio)   c.texto(lineaLR('Folio:', sale.folio));

  c.texto(separador());

  // Items
  for (const item of sale.items) {
    const lines = envolver(item.produto.nombre, CARACTERES_POR_LINEA - 8);
    const total = fmtMonto(item.cantidad * item.precio);
    c.texto(lineaLR(lines[0], total));
    for (let i = 1; i < lines.length; i++) c.texto('  ' + lines[i]);
    c.texto(`  ${item.cantidad} x ${fmtMonto(item.precio)}`);
  }

  c.texto(separador());

  // Totales
  if (sale.subtotal !== undefined) c.texto(lineaLR('Subtotal:', `RD$${fmtMonto(sale.subtotal)}`));
  if (sale.iva !== undefined && sale.iva > 0) c.texto(lineaLR('ITBIS:', `RD$${fmtMonto(sale.iva)}`));
  c.bold(true).texto(lineaLR('TOTAL:', `RD$${fmtMonto(sale.total)}`)).bold(false);
  if (sale.cambio !== undefined && sale.cambio > 0) c.texto(lineaLR('Cambio:', `RD$${fmtMonto(sale.cambio)}`));
  if (sale.metodo) {
    const m = sale.metodo.charAt(0).toUpperCase() + sale.metodo.slice(1);
    c.texto(lineaLR('Método:', m));
  }

  // e-CF
  if (sale.encf) {
    c.texto(separador());
    c.alignCenter();
    c.texto(centrar('COMPROBANTE FISCAL'));
    c.texto(centrar(sale.encf));
    c.alignLeft();
  } else if (sale.ecfPendiente) {
    c.texto(separador());
    c.alignCenter();
    c.texto(centrar('e-CF PENDIENTE'));
    c.alignLeft();
  }

  c.salto(1).alignCenter().texto(centrar('Gracias por su compra!')).salto(3).cortar();

  return c.build();
}

// ── Bluetooth connection ────────────────────────────────────────────────────────

async function findCharacteristic(server: any): Promise<any> {
  const services: any[] = await server.getPrimaryServices();
  for (const svc of services) {
    const chars: any[] = await svc.getCharacteristics();
    for (const ch of chars) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) return ch;
    }
  }
  return null;
}

export async function conectarImpresora(): Promise<string> {
  if (!('bluetooth' in navigator)) {
    throw new Error('Web Bluetooth no está disponible. Usa Chrome en Android con HTTPS.');
  }
  const nav = navigator as any;
  const device = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICE_UUIDS,
  });

  const server = await device.gatt.connect();
  const char   = await findCharacteristic(server);
  if (!char) throw new Error('No se encontró característica de escritura en la impresora');

  btDevice = device;
  btChar   = char;
  const nombre = device.name ?? 'Impresora BT';
  localStorage.setItem('bt_impresora_nombre', nombre);

  device.addEventListener('gattserverdisconnected', () => {
    btChar = null;
    // btDevice sigue para reconexión
  });

  return nombre;
}

export async function desconectarImpresora(): Promise<void> {
  try { btDevice?.gatt?.disconnect(); } catch { /* noop */ }
  btDevice = null;
  btChar   = null;
  localStorage.removeItem('bt_impresora_nombre');
}

export function estaConectada(): boolean {
  return !!(btDevice?.gatt?.connected && btChar);
}

export function getNombreImpresora(): string {
  return localStorage.getItem('bt_impresora_nombre') ?? '';
}

async function enviarDatos(bytes: Uint8Array): Promise<void> {
  // Reconnect if GATT server disconnected
  if (!btChar && btDevice) {
    const server = await btDevice.gatt.connect();
    btChar = await findCharacteristic(server);
  }
  if (!btChar) throw new Error('Impresora no conectada. Conéctala desde Menú → Impresora BT.');

  const CHUNK = 180;
  for (let off = 0; off < bytes.length; off += CHUNK) {
    const chunk = bytes.slice(off, off + CHUNK);
    if (btChar.properties.writeWithoutResponse) {
      await btChar.writeValueWithoutResponse(chunk);
    } else {
      await btChar.writeValue(chunk);
    }
    await new Promise<void>(r => setTimeout(r, 20));
  }
}

export async function imprimirReciboEscPos(sale: SaleBT, empresa: EmpresaBT): Promise<void> {
  const bytes = generarReciboESCPOS(sale, empresa);
  await enviarDatos(bytes);
}

export async function imprimirPruebaEscPos(): Promise<void> {
  const bytes = generarReciboESCPOS({
    total: 0,
    items: [],
    cajero: 'Cajero POS',
    folio:  'PRUEBA',
    empresaNombreComercial: 'HiCloud POS',
    fechaEmision: new Date().toLocaleDateString('es-DO'),
    horaEmision:  new Date().toLocaleTimeString('es-DO'),
  }, {});
  await enviarDatos(bytes);
}
