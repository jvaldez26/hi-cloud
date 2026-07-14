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

// Elimina tildes y diacríticos para que la impresora térmica los muestre correctamente.
function sanear(txt: string): string {
  // NFD descompone ó → o + combining accent; luego borramos los combining marks
  return txt.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function envolver(texto: string, maxLen = CARACTERES_POR_LINEA): string[] {
  const palabras = sanear(texto).split(' ');
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
  const txt = sanear(texto).slice(0, ancho);
  const pad = Math.max(0, Math.floor((ancho - txt.length) / 2));
  return ' '.repeat(pad) + txt;
}

export function lineaLR(izq: string, der: string, ancho = CARACTERES_POR_LINEA): string {
  const i2  = sanear(izq);
  const d2  = sanear(der);
  const maxIzq = ancho - d2.length - 1;
  const i = i2.length > maxIzq ? i2.slice(0, maxIzq - 1) + '>' : i2;
  const espacio = ancho - i.length - d2.length;
  return i + ' '.repeat(Math.max(1, espacio)) + d2;
}

export function separador(char = '-', ancho = CARACTERES_POR_LINEA): string {
  return char.repeat(ancho);
}

// ── ESC/POS command builder ────────────────────────────────────────────────────

function comandos() {
  const bufs: Uint8Array[] = [];
  const b = (...bytes: number[]) => bufs.push(new Uint8Array(bytes));
  const t = (txt: string) => bufs.push(new TextEncoder().encode(sanear(txt) + '\n'));

  const api = {
    init()            { b(0x1B, 0x40); return api; },
    alignCenter()     { b(0x1B, 0x61, 0x01); return api; },
    alignLeft()       { b(0x1B, 0x61, 0x00); return api; },
    bold(on: boolean) { b(0x1B, 0x45, on ? 1 : 0); return api; },
    doble(on: boolean){ b(0x1D, 0x21, on ? 0x11 : 0x00); return api; },
    texto(txt: string){ t(txt); return api; },
    salto(n = 1)      { for (let i = 0; i < n; i++) b(0x0A); return api; },
    cortar()          { b(0x1D, 0x56, 0x42, 0x00); return api; },

    // QR nativo ESC/POS — GS ( k — compatible con la mayoría de térmicas 58mm
    qr(data: string, size = 4) {
      const enc  = new TextEncoder().encode(data);
      const dLen = enc.length + 3;      // pL pH cuenta m + fn + c1 + data
      const pL   = dLen & 0xFF;
      const pH   = (dLen >> 8) & 0xFF;
      b(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // Modelo 2
      b(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size & 0xFF); // Tamaño módulo
      b(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);        // Error correction M
      bufs.push(new Uint8Array([0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30])); // Almacenar datos
      bufs.push(enc);
      b(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);        // Imprimir QR
      return api;
    },

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
  securityCode?:           string;
  qrUrl?:                  string;
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

  // ── Header ─────────────────────────────────────────────────────────────────
  c.alignCenter();
  c.bold(true).doble(true).texto(centrar(nombreEmp)).doble(false).bold(false);
  if (rncEmp) c.texto(centrar(`RNC: ${rncEmp}`));
  if (dirEmp) { for (const l of envolver(dirEmp)) c.texto(centrar(l)); }
  if (telEmp) c.texto(centrar(`Tel: ${telEmp}`));
  c.salto(1);

  // ── Encabezado de venta ────────────────────────────────────────────────────
  c.alignLeft();
  c.texto(separador());
  c.texto(lineaLR('Fecha:', fecha));
  c.texto(lineaLR('Hora:', hora));
  if (sale.cajero)  c.texto(lineaLR('Cajero:', sale.cajero.slice(0, 20)));
  if (sale.cliente) c.texto(lineaLR('Cliente:', sale.cliente.slice(0, 19)));
  if (sale.folio)   c.texto(lineaLR('Folio:', sale.folio));

  // ── Items ──────────────────────────────────────────────────────────────────
  c.texto(separador());
  for (const item of sale.items) {
    const lines = envolver(item.produto.nombre, CARACTERES_POR_LINEA - 8);
    const totalItem = fmtMonto(item.cantidad * item.precio);
    c.texto(lineaLR(lines[0], totalItem));
    for (let i = 1; i < lines.length; i++) c.texto('  ' + lines[i]);
    c.texto(`  ${item.cantidad} x ${fmtMonto(item.precio)}`);
  }

  // ── Totales ────────────────────────────────────────────────────────────────
  c.texto(separador());
  if (sale.subtotal !== undefined) c.texto(lineaLR('Subtotal:', `RD$${fmtMonto(sale.subtotal)}`));
  if (sale.iva !== undefined && sale.iva > 0) c.texto(lineaLR('ITBIS:', `RD$${fmtMonto(sale.iva)}`));
  c.bold(true).texto(lineaLR('TOTAL:', `RD$${fmtMonto(sale.total)}`)).bold(false);
  if (sale.cambio !== undefined && sale.cambio > 0) c.texto(lineaLR('Cambio:', `RD$${fmtMonto(sale.cambio)}`));
  if (sale.metodo) {
    const m = sale.metodo.charAt(0).toUpperCase() + sanear(sale.metodo.slice(1));
    c.texto(lineaLR('Metodo:', m));
  }

  // ── e-CF / Comprobante Fiscal ──────────────────────────────────────────────
  if (sale.encf) {
    c.texto(separador());
    c.alignCenter();
    c.bold(true).texto(centrar('COMPROBANTE FISCAL')).bold(false);
    c.texto(centrar(sale.encf));

    // Código de seguridad (firma DGII)
    if (sale.securityCode) {
      c.salto(1);
      c.texto(centrar('Codigo de Seguridad:'));
      c.texto(centrar(sale.securityCode));
    }

    // QR de verificación DGII
    if (sale.qrUrl && !sale.ecfPendiente) {
      c.salto(1);
      c.qr(sale.qrUrl, 4);
      c.salto(1);
      c.texto(centrar('Escanea para verificar'));
    }

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
  let services: any[] = [];
  try { services = await server.getPrimaryServices(); } catch { return null; }
  for (const svc of services) {
    try {
      const chars: any[] = await svc.getCharacteristics();
      for (const ch of chars) {
        if (ch.properties.write || ch.properties.writeWithoutResponse) return ch;
      }
    } catch { /* omitir servicio con error */ }
  }
  return null;
}

/** Intenta reconectar usando btDevice ya conocido (sin getDevices). */
async function _reconectarDesdeDispositivo(): Promise<void> {
  if (!btDevice || btChar) return;
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    if (btChar) return;
    try {
      const server = await btDevice.gatt.connect();
      const char   = await findCharacteristic(server);
      if (char) { btChar = char; return; }
    } catch { /* retry */ }
  }
}

export async function conectarImpresora(): Promise<string> {
  if (!('bluetooth' in navigator)) {
    throw new Error('Web Bluetooth no esta disponible. Usa Chrome en Android con HTTPS.');
  }
  const nav = navigator as any;
  const device = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICE_UUIDS,
  });

  const server = await device.gatt.connect();
  const char   = await findCharacteristic(server);
  if (!char) throw new Error('No se encontro caracteristica de escritura en la impresora');

  btDevice = device;
  btChar   = char;
  const nombre = device.name ?? 'Impresora BT';
  localStorage.setItem('bt_impresora_nombre', nombre);

  device.addEventListener('gattserverdisconnected', () => {
    btChar = null;
    _reconectarDesdeDispositivo(); // reconectar en background si el dispositivo sigue disponible
  });

  return nombre;
}

/** Intenta reconectar silenciosamente usando los dispositivos previamente autorizados.
 *  Chrome recuerda los permisos BT sin nueva solicitud de usuario (requiere Chrome 85+).
 *  Reintenta hasta 4 veces con pausa de 2 s entre intentos — el stack BT puede necesitar
 *  unos segundos después del F5 para estar listo. */
export async function autoReconectarImpresora(): Promise<string | null> {
  if (!('bluetooth' in navigator)) return null;
  if (btChar) return getNombreImpresora();
  const nombreGuardado = localStorage.getItem('bt_impresora_nombre');
  if (!nombreGuardado) return null;

  const nav = navigator as any;
  if (typeof nav.bluetooth?.getDevices !== 'function') return null;

  const MAX = 4;
  for (let intento = 0; intento < MAX; intento++) {
    if (intento > 0) await new Promise(r => setTimeout(r, 2000));
    if (btChar) return getNombreImpresora(); // otro intento tuvo éxito
    try {
      const devices: any[] = await nav.bluetooth.getDevices();
      for (const device of devices) {
        try {
          const server = await device.gatt.connect();
          const char   = await findCharacteristic(server);
          if (char) {
            btDevice = device;
            btChar   = char;
            const nombre = device.name ?? nombreGuardado;
            localStorage.setItem('bt_impresora_nombre', nombre);
            device.addEventListener('gattserverdisconnected', () => {
              btChar = null;
              _reconectarDesdeDispositivo();
            });
            return nombre;
          }
        } catch { /* este dispositivo no disponible, probar el siguiente */ }
      }
    } catch { return null; /* getDevices no soportado o error fatal */ }
  }

  return null;
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
  // Reconectar si el GATT server se desconectó (apagado/alejamiento temporal)
  if (!btChar && btDevice) {
    const server = await btDevice.gatt.connect();
    btChar = await findCharacteristic(server);
  }
  if (!btChar) throw new Error('Impresora no conectada. Conectala desde Menu → Impresora BT.');

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

// ── Convertir HTML térmico del POS a ESC/POS ────────────────────────────────
// Entiende las clases CSS que producen buildReciboTermicoHTML, buildDocTermicoHTML
// y buildCierreCajaHTML: row, center, bold, xlarge, line, dbl.
function htmlAEscPos(html: string): Uint8Array {
  const doc  = new DOMParser().parseFromString(html, 'text/html');
  const c    = comandos().init();

  function proc(el: Element, isCentrado = false) {
    const tag = el.tagName.toLowerCase();
    if (['style', 'script', 'head', 'img'].includes(tag)) return;
    if (tag === 'hr') { c.alignLeft(); c.texto(separador('-')); return; }

    const cls      = (el.className ?? '') as string;
    const esLinea  = cls === 'line';
    const esDoble  = cls === 'dbl';
    const esRow    = cls.includes('row');
    const esBold   = cls.includes('bold') || cls.includes('xlarge');
    const esXl     = cls.includes('xlarge');
    const esCentro = cls.includes('center') || isCentrado;

    if (esLinea) { c.alignLeft(); c.texto(separador('.')); return; }
    if (esDoble) { c.alignLeft(); c.texto(separador('=')); return; }

    if (esRow) {
      const spans = Array.from(el.querySelectorAll(':scope > span'));
      if (spans.length >= 2) {
        const izq = spans[0].textContent?.trim() ?? '';
        const der = spans[1].textContent?.trim() ?? '';
        if (esBold)  c.bold(true);
        if (esXl)    c.doble(true);
        c.alignLeft().texto(lineaLR(izq, der));
        if (esXl)    c.doble(false);
        if (esBold)  c.bold(false);
        return;
      }
    }

    // Si tiene hijos elemento, recurrir propagando centrado
    const hijos = Array.from(el.children);
    if (hijos.length > 0) {
      for (const h of hijos) proc(h, esCentro);
      return;
    }

    // Hoja con texto
    const texto = el.textContent?.trim() ?? '';
    if (!texto) return;

    if (esBold)  c.bold(true);
    if (esXl)    c.doble(true);
    if (esCentro) c.alignCenter(); else c.alignLeft();

    for (const linea of envolver(texto)) {
      c.texto(esCentro ? centrar(linea) : linea);
    }
    if (esXl)    c.doble(false);
    if (esBold)  c.bold(false);
  }

  for (const ch of doc.body.children) proc(ch);
  c.alignLeft().salto(3).cortar();
  return c.build();
}

/** Imprime cualquier HTML térmico del POS en la impresora BT (sin diálogo del navegador). */
export async function imprimirHtmlEnBT(html: string): Promise<void> {
  const bytes = htmlAEscPos(html);
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
