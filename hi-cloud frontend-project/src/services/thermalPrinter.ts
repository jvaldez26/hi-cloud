// ESC/POS Bluetooth Thermal Printer — 58mm (32 chars/line)
// Web Bluetooth API: Chrome/Edge on Android + HTTPS only.
import QRCode from 'qrcode';

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
let _falloWatchAdvertisements = false; // watchAdvertisements no disponible en el último intento

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

    // QR raster bitmap — GS v 0 — compatible con térmicas BT-58UB y similares que
    // no implementan GS ( k (2D nativo). Los bytes ya vienen pre-renderizados desde canvas.
    qrBitmap(data: Uint8Array, w: number, h: number) {
      const byteWidth = Math.ceil(w / 8);
      b(0x1B, 0x61, 0x01);                                                 // centrar
      b(0x1D, 0x76, 0x30, 0x00,
        byteWidth & 0xFF, (byteWidth >> 8) & 0xFF,
        h & 0xFF, (h >> 8) & 0xFF);                                        // GS v 0 m=0
      bufs.push(data);
      b(0x1B, 0x61, 0x00);                                                 // alinear izq
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

// Renderiza el QR como bitmap 1-bit para GS v 0 (compatible con térmicas sin GS(k 2D).
// Pre-render antes de armar el buffer ESC/POS porque toCanvas es async.
async function _renderQrToBitmap(
  data: string,
): Promise<{ data: Uint8Array; w: number; h: number } | null> {
  try {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, data, { width: 160, margin: 2, errorCorrectionLevel: 'M' });
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('[QR-BT] getContext() null — se omite QR del ticket');
      return null;
    }
    const w = canvas.width;
    const h = canvas.height;
    const byteWidth = Math.ceil(w / 8);
    const { data: pixels } = ctx.getImageData(0, 0, w, h); // RGBA flat array
    const out = new Uint8Array(byteWidth * h);
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < byteWidth; col++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const px = row * w + col * 8 + bit;
          // Canal R con umbral <128 → bit encendido (punto negro). Ignoramos alpha.
          if (px < w * h && pixels[px * 4] < 128) byte |= (0x80 >> bit); // MSB-first
        }
        out[row * byteWidth + col] = byte;
      }
    }
    return { data: out, w, h };
  } catch (err) {
    console.warn('[QR-BT] Error al renderizar QR a bitmap — se omite QR del ticket:', err);
    return null;
  }
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
  items:                   Array<{
    produto: { nombre: string; porcentajeIva?: number };
    cantidad: number;
    precio: number;
    /** descuento por unidad en BASE imponible (convención B del POS) */
    descuentoMonto?: number;
  }>;
  iva?:                    number;
  subtotal?:               number;
  /** descuento global en BASE imponible — alimenta el desglose fiscal */
  descuentoGlobal?:        number;
  /** importe PACTADO con el cliente (c/ITBIS) — es el que se imprime */
  descuentoGlobalFinal?:   number;
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

const r2BT = (n: number) => Math.round(n * 100) / 100;

export async function generarReciboESCPOS(sale: SaleBT, empresa: EmpresaBT): Promise<Uint8Array> {
  // Pre-renderizar QR antes de armar el buffer (toCanvas es async; el buffer es síncrono)
  let qrBitmapResult: { data: Uint8Array; w: number; h: number } | null = null;
  if (sale.qrUrl && !sale.ecfPendiente) {
    qrBitmapResult = await _renderQrToBitmap(sale.qrUrl);
  }

  const nombreEmp = empresa.nombre ?? sale.empresaNombreComercial ?? 'HiCloud POS';
  const rncEmp    = empresa.rnc    ?? sale.empresaRnc    ?? '';
  const dirEmp    = empresa.direccion ?? sale.empresaDireccion ?? '';
  const telEmp    = empresa.telefono  ?? sale.empresaTelefono  ?? '';

  const fecha = sale.fechaEmision ?? new Date().toLocaleDateString('es-DO');
  const hora  = sale.horaEmision  ?? new Date().toLocaleTimeString('es-DO');

  const c = comandos().init();

  // ── Header ─────────────────────────────────────────────────────────────────
  // GS! (doble) resetea ESC a en BT-58UB de forma irrecuperable para las líneas siguientes.
  // Se usa solo bold() — igual que el bloque e-CF que funciona — para garantizar centrado.
  c.alignCenter();
  c.bold(true).texto(centrar(nombreEmp)).bold(false);
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
  const subtotalBT = sale.subtotal ?? 0;
  const ivaBT      = sale.iva      ?? 0;
  const ivaFactor  = subtotalBT > 0 ? 1 + ivaBT / subtotalBT : 1;
  for (const item of sale.items) {
    const lines    = envolver(item.produto.nombre, CARACTERES_POR_LINEA - 8);
    // Factor del propio ítem cuando se conoce su tasa; si no, el factor global del ticket
    const factor   = item.produto.porcentajeIva !== undefined
      ? 1 + Number(item.produto.porcentajeIva) / 100
      : ivaFactor;
    const descUnit = Number(item.descuentoMonto ?? 0);
    // MISMO criterio que el ticket HTML: el importe de línea es el NETO de descuento
    const precioConIva = (item.precio - descUnit) * factor;
    const totalItem    = fmtMonto(item.cantidad * precioConIva);
    c.texto(lineaLR(lines[0], totalItem));
    for (let i = 1; i < lines.length; i++) c.texto('  ' + lines[i]);
    c.texto(`  ${item.cantidad} x ${fmtMonto(precioConIva)}`);
    if (descUnit > 0) {
      c.texto(`  Desc: -${fmtMonto(descUnit * factor)} c/u (orig. ${fmtMonto(item.precio * factor)})`);
    }
  }

  // ── Totales ────────────────────────────────────────────────────────────────
  c.texto(separador());
  // MISMO criterio que el recibo HTML: con descuento global el bloque habla en
  // pesos c/ITBIS (lo pactado con el cliente) y el desglose fiscal va bajo el
  // total. Sin descuento se mantiene el formato clásico base + ITBIS.
  const descBaseBT   = sale.descuentoGlobal ?? 0;
  const descPactoBT  = sale.descuentoGlobalFinal ?? descBaseBT;
  if (descBaseBT > 0) {
    c.texto(lineaLR('Subtotal (c/ITBIS):', `RD$${fmtMonto(r2BT(sale.total + descPactoBT))}`));
    // (el recibo BT no imprime propina, así que el total es solo mercancía)
    c.texto(lineaLR('Descuento:', `-RD$${fmtMonto(descPactoBT)}`));
  } else {
    if (sale.subtotal !== undefined) c.texto(lineaLR('Subtotal:', `RD$${fmtMonto(sale.subtotal)}`));
    if (sale.iva !== undefined && sale.iva > 0) c.texto(lineaLR('ITBIS:', `RD$${fmtMonto(sale.iva)}`));
  }
  c.bold(true).texto(lineaLR('TOTAL:', `RD$${fmtMonto(sale.total)}`)).bold(false);
  if (descBaseBT > 0 && sale.subtotal !== undefined) {
    c.texto(lineaLR('Base imponible:', `RD$${fmtMonto(r2BT(sale.subtotal - descBaseBT))}`));
    if (sale.iva !== undefined && sale.iva > 0) c.texto(lineaLR('ITBIS:', `RD$${fmtMonto(sale.iva)}`));
  }
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

    // QR de verificación DGII (raster GS v 0 — compatible BT-58UB)
    if (sale.qrUrl && !sale.ecfPendiente) {
      c.salto(1);
      if (qrBitmapResult) c.qrBitmap(qrBitmapResult.data, qrBitmapResult.w, qrBitmapResult.h);
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

  c.salto(1).alignCenter().texto(centrar('Gracias por su compra!')).salto(1)
    .texto(centrar('Generado por HiCloud ERP')).salto(3).cortar();

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

// gatt.connect() puede colgar indefinidamente en Android — siempre usar con timeout.
function gattConnectWithTimeout(device: any, ms = 7000): Promise<any> {
  return Promise.race([
    device.gatt.connect(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('gatt timeout')), ms)
    ),
  ]);
}

/** Establece btDevice/btChar y registra el listener de desconexión GATT.
 *  Al desconectarse solo nulifica btChar; la reconexión ocurre bajo demanda
 *  en enviarDatos() para no interferir con la recuperación natural del stack BT. */
function _registrarDispositivo(device: any, char: any): void {
  btDevice = device;
  btChar   = char;
  device.addEventListener('gattserverdisconnected', () => { btChar = null; });
}

/** Espera el primer advertisement del device y luego ejecuta gatt.connect().
 *  Más fiable que gatt.connect() directo tras un reload: el device puede no estar
 *  anunciándose en el instante exacto del intento; watchAdvertisements() lo espera.
 *  Resuelve true si logró conectar, false si expiró el timeout o hubo error. */
function _conectarViaAdvertisement(device: any, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    let done = false;
    const settle = (ok: boolean) => { if (!done) { done = true; resolve(ok); } };

    // AbortSignal.timeout() es Chrome 103+; AbortController manual como fallback.
    let signal: AbortSignal;
    let controller: AbortController | null = null;
    if (typeof (AbortSignal as any).timeout === 'function') {
      signal = (AbortSignal as any).timeout(timeoutMs);
    } else {
      controller = new AbortController();
      setTimeout(() => controller!.abort(), timeoutMs);
      signal = controller.signal;
    }

    const onAbort = () => {
      device.removeEventListener('advertisementreceived', onAdvert);
      settle(false); // expiró — el dispositivo no se anunció en timeoutMs ms
    };

    const onAdvert = () => {
      // Quitar el listener de abort ANTES de conectar para que expire sin interferir
      signal.removeEventListener('abort', onAbort);
      try { device.unwatchAdvertisements(); } catch (e) {
        console.error('[BT] unwatchAdvertisements() falló en', device.name, ':', e);
      }
      void (async () => {
        try {
          const server = await gattConnectWithTimeout(device, 7000);
          const char   = await findCharacteristic(server);
          if (char) {
            _registrarDispositivo(device, char);
            settle(true);
          } else {
            console.error('[BT] findCharacteristic retornó null tras advertisement en', device.name);
            settle(false);
          }
        } catch (err) {
          console.error('[BT] gatt.connect() tras advertisement falló en', device.name, ':', err);
          settle(false);
        }
      })();
    };

    signal.addEventListener('abort', onAbort);
    device.addEventListener('advertisementreceived', onAdvert, { once: true });

    try {
      device.watchAdvertisements({ signal });
    } catch (err) {
      console.error('[BT] watchAdvertisements() lanzó excepción en', device.name, ':', err);
      signal.removeEventListener('abort', onAbort);
      device.removeEventListener('advertisementreceived', onAdvert);
      settle(false);
    }
  });
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

  device.addEventListener('gattserverdisconnected', () => { btChar = null; });

  return nombre;
}

/** Indica si el navegador soporta reconexión BT automática tras reload.
 *  Requiere navigator.bluetooth.getDevices (Chrome 85+, HTTPS). */
export function bluetoothAutoReconexionDisponible(): boolean {
  return 'bluetooth' in navigator &&
    typeof (navigator as any).bluetooth?.getDevices === 'function';
}

/** true si el último intento de autoReconectarImpresora() entró al fallback porque
 *  el device no tiene watchAdvertisements disponible (flag experimental desactivado). */
export function huboFalloWatchAdvertisements(): boolean {
  return _falloWatchAdvertisements;
}

/** Intenta reconectar silenciosamente usando los dispositivos previamente autorizados.
 *  Estrategia principal: watchAdvertisements() como puerta antes de gatt.connect()
 *  para el dispositivo conocido — espera a que el device se anuncie antes de conectar,
 *  resolviendo el fallo de gatt.connect() directo inmediatamente tras un reload.
 *  Fallback: gatt.connect() directo para todos los devices si watchAdvertisements
 *  no está disponible o si el device nombrado no se anuncia en 13 s.
 *  El caller (useEffect en POSPage) gestiona los reintentos cada 5 s durante 90 s. */
export async function autoReconectarImpresora(): Promise<string | null> {
  if (!('bluetooth' in navigator)) return null;
  if (btChar) return getNombreImpresora();
  const nombreGuardado = localStorage.getItem('bt_impresora_nombre');
  if (!nombreGuardado) return null;

  const nav = navigator as any;
  if (typeof nav.bluetooth?.getDevices !== 'function') return null;

  let devices: any[];
  try {
    devices = await nav.bluetooth.getDevices();
  } catch (err) {
    console.error('[BT] getDevices() falló:', err);
    return null;
  }
  if (!devices.length) return null;

  // Dispositivo con nombre guardado primero; resto como fallback
  const ordenados: any[] = [
    ...devices.filter((d: any) => d.name === nombreGuardado),
    ...devices.filter((d: any) => d.name !== nombreGuardado),
  ];

  _falloWatchAdvertisements = false; // reset antes de cada intento

  // ── Estrategia 1: watchAdvertisements → gatt.connect() para el dispositivo nombrado ─
  const nombrado = ordenados.find((d: any) => d.name === nombreGuardado);
  if (nombrado) {
    if (typeof nombrado.watchAdvertisements === 'function') {
      const ok = await _conectarViaAdvertisement(nombrado, 13000);
      if (ok) {
        const nombre = nombrado.name ?? nombreGuardado;
        localStorage.setItem('bt_impresora_nombre', nombre);
        return nombre;
      }
      console.warn('[BT] watchAdvertisements expiró para "' + nombreGuardado + '" — fallback a gatt.connect() directo');
    } else {
      _falloWatchAdvertisements = true;
      console.warn('[BT] watchAdvertisements no disponible (flag experimental off) para "' + nombreGuardado + '" — usando gatt.connect() directo');
    }
  }

  // ── Estrategia 2: gatt.connect() directo para todos los devices (fallback) ────────────
  for (const device of ordenados) {
    if (btChar) return getNombreImpresora(); // intento paralelo tuvo éxito
    const nombre = device.name ?? nombreGuardado;
    try {
      const server = await gattConnectWithTimeout(device, 7000);
      const char   = await findCharacteristic(server);
      if (char) {
        _registrarDispositivo(device, char);
        localStorage.setItem('bt_impresora_nombre', nombre);
        return nombre;
      }
    } catch (err) {
      console.error('[BT] gatt.connect() directo falló para "' + nombre + '":', err);
    }
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
    const server = await gattConnectWithTimeout(btDevice, 8000);
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
  const bytes = await generarReciboESCPOS(sale, empresa);
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
  const bytes = await generarReciboESCPOS({
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
