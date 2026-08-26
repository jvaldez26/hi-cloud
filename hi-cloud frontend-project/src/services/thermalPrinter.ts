// ESC/POS Bluetooth Thermal Printer — 58mm (32 chars/line)
// Web Bluetooth API: Chrome/Edge on Android + HTTPS only.
import JsBarcode from 'jsbarcode';
import { ahora, fecha as fechaRD, horaConSegundos } from '../utils/fechaRD';

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
  // El texto sale por TextEncoder (UTF-8) y estas impresoras interpretan CP437:
  // cualquier carácter fuera de ASCII se imprime como dos o tres símbolos basura.
  // Los guiones y comillas tipográficos entran por los datos (un nombre pegado
  // desde Word, un guion largo de fallback) y hay que bajarlos a su equivalente
  // ASCII antes de mandarlos.
  //
  // La degradación vive AQUÍ y solo aquí. El ticket del navegador es una página
  // rasterizada y dibuja estos glifos perfectamente; no tiene por qué
  // empobrecerse porque la BT-58UB no pueda con ellos. La plantilla se queda con
  // el carácter bueno y este es el único camino que lo baja.
  const ascii = txt
    .replace(/[‐-―]/g, '-')   // ‐ ‑ ‒ – —
    .replace(/[‘’]/g, "'")    // ' '
    .replace(/[“”]/g, '"')    // " "
    // Marca de recorte del nombre del producto. Un punto y no tres: el recorte
    // ya contó un carácter, y tres se comen dos del ancho de la línea.
    .replace(/…/g, '.')
    .replace(/·/g, '-')            // · (ya se usaba como separador y salía basura)
    .replace(/×/g, 'x')            // línea de cantidad: 3 × RD$1200.00
    .replace(/⚠/g, '!')            // aviso del comprobante en proceso
    // Marca de pesable. Se cae sin más: la línea de detalle ya lo dice en texto
    // ("12.500 KG x RD$96.00", o "Precio fijo etiqueta" cuando la balanza no
    // reporta unidad), así que quitarla no pierde información.
    .replace(/ ?⚖/g, '')
    // Iconos de módulo. Se van con el espacio que los sigue para no dejar un
    // hueco doble delante de la etiqueta, que es la que informa.
    .replace(/[🌀-🫿]️? ?/gu, '')
    .replace(/ /g, ' ');           // espacio duro
  // NFD descompone ó → o + combining accent; luego borramos los combining marks
  return ascii.normalize('NFD').replace(/[̀-ͯ]/g, '');
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
    alignRight()      { b(0x1B, 0x61, 0x02); return api; },
    // Doble alto y ancho con ESC ! — NO con GS !.
    // En la BT-58UB, GS ! deja ESC a (la alineación) inservible para todo lo que
    // venga después, y no se recupera. Como el TOTAL va a doble altura en los dos
    // formatos, con GS ! el resto del ticket salía desalineado siempre.
    // 0x38 = énfasis (0x08) + doble alto (0x10) + doble ancho (0x20).
    doble(on: boolean){ b(0x1B, 0x21, on ? 0x38 : 0x00); return api; },
    texto(txt: string){ t(txt); return api; },
    salto(n = 1)      { for (let i = 0; i < n; i++) b(0x0A); return api; },
    cortar()          { b(0x1D, 0x56, 0x42, 0x00); return api; },

    // Raster bitmap — GS v 0 — compatible con térmicas BT-58UB y similares que
    // no implementan los comandos nativos de QR (GS ( k) ni de barras (GS k).
    // Los bytes ya vienen pre-renderizados desde canvas. Lo usan el QR de la
    // DGII y el código de barras del conduce.
    bitmap(data: Uint8Array, w: number, h: number) {
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

/** Puntos por mm de las térmicas del parque (203 dpi). */
const PUNTOS_POR_MM = 8;

// Rasteriza una imagen (data URL) a bitmap 1-bit para GS v 0 — el mismo camino
// que ya usaba el QR, ahora alimentado desde el <img> del HTML del ticket.
//
// El escalado es NEAREST-NEIGHBOUR a propósito (imageSmoothingEnabled = false).
// Con suavizado, cada módulo del QR queda con el borde gris, el umbral lo parte
// por la mitad y el lector pierde justo el canto en el que se apoya.
async function _imgDataUrlABitmap(
  src: string,
  anchoDots: number,
): Promise<{ data: Uint8Array; w: number; h: number } | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload  = () => resolve(el);
      el.onerror = () => reject(new Error('no se pudo decodificar la imagen del ticket'));
      el.src = src;
    });
    // Múltiplo de 8: GS v 0 trabaja por bytes y así no sobra media columna.
    const w = Math.max(8, Math.round(anchoDots / 8) * 8);
    const h = Math.max(8, Math.round(w * (img.height / img.width)));
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('[QR-BT] getContext() null — se omite QR del ticket');
      return null;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
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

/**
 * Rasteriza un Code128 a bitmap 1-bit para GS v 0.
 *
 * Mismo motivo que el QR de la DGII: las BT-58UB y parientes no implementan
 * GS k, así que el código va como imagen. Y por el mismo motivo no vale con
 * dejar el <img> en el HTML — htmlAEscPos descarta las imágenes, así que un
 * barcode puesto solo como <img> se perdería en silencio por Bluetooth.
 *
 * El ancho se limita a 376 dots (múltiplo de 8, cabe en 58mm) reduciendo el
 * grosor de barra antes que escalar el bitmap: un Code128 reescalado deja de
 * escanear.
 */
const BT_ANCHO_DOTS = 376;

async function _renderBarcodeToBitmap(
  valor: string,
): Promise<{ data: Uint8Array; w: number; h: number } | null> {
  try {
    let canvas: HTMLCanvasElement | null = null;
    // De más grueso a más fino: la barra más gruesa que quepa es la que mejor
    // escanea en una térmica de 203 dpi.
    for (const barWidth of [3, 2, 1]) {
      const c = document.createElement('canvas');
      JsBarcode(c, valor, {
        format:       'CODE128',
        width:        barWidth,
        height:       60,
        displayValue: false,   // el número va debajo como texto ESC/POS, más nítido
        margin:       0,
        background:   '#ffffff',
        lineColor:    '#000000',
      });
      canvas = c;
      if (c.width <= BT_ANCHO_DOTS) break;
    }
    if (!canvas) return null;
    if (canvas.width > BT_ANCHO_DOTS) {
      console.warn(`[BARCODE-BT] ${valor} no cabe en 58mm ni con barra de 1 dot — se omite`);
      return null;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('[BARCODE-BT] getContext() null — se omite el código de barras');
      return null;
    }
    const w = canvas.width;
    const h = canvas.height;
    const byteWidth = Math.ceil(w / 8);
    const { data: pixels } = ctx.getImageData(0, 0, w, h); // RGBA plano
    const out = new Uint8Array(byteWidth * h);
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < byteWidth; col++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = col * 8 + bit;
          if (x >= w) continue;   // relleno del último byte: blanco, no la fila siguiente
          const px = row * w + x;
          // Canal R con umbral <128 → bit encendido (punto negro).
          if (pixels[px * 4] < 128) byte |= (0x80 >> bit); // MSB-first
        }
        out[row * byteWidth + col] = byte;
      }
    }
    return { data: out, w, h };
  } catch (err) {
    console.warn('[BARCODE-BT] Error al rasterizar el código de barras — se omite:', err);
    return null;
  }
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

// ── Convertir HTML térmico del POS a ESC/POS ────────────────────────────────
// Entiende las clases CSS que producen buildReciboTermicoHTML, buildDocTermicoHTML
// y buildCierreCajaHTML: row, center, r, gap, bold, xlarge, line, dbl.
//
// Este es el ÚNICO camino del ticket de venta a la impresora Bluetooth. Antes
// el BT tenía su propio generador escrito a mano (`generarReciboESCPOS`) y
// llevaba tiempo divergiendo del ticket del navegador: no imprimía la sucursal,
// el módulo, el RNC del comprador, el bloque "MODIFICA A", el mensaje del ticket
// ni la política de devoluciones — y tampoco la fecha de firma de la DGII, que
// es exigible. Ese generador se borró en vez de arrastrarlo: dos plantillas del
// mismo ticket no se mantienen sincronizadas solas.
/**
 * Exportada para poder verificar la conversión sin una impresora emparejada:
 * que el ráster del código de barras sale, y cuántos saltos de línea y cuánto
 * ráster ocupa el ticket, que es como se mide el ahorro de papel sin gastarlo.
 */
export async function htmlAEscPos(html: string): Promise<Uint8Array> {
  const doc  = new DOMParser().parseFromString(html, 'text/html');
  const c    = comandos().init();

  // Las imágenes se rasterizan ANTES de recorrer el DOM: proc() es síncrono, y
  // ni decodificar un data URL ni pintar un Code128 en un canvas lo son.
  //
  // Un solo bucle para los dos casos. Estuvieron separados —el QR de la DGII y
  // el Code128 del conduce llegaron por caminos distintos— y tener dos sitios
  // que deciden qué imagen sobrevive al Bluetooth es exactamente como la
  // siguiente se pierde en silencio.
  const bitmaps = new Map<Element, { data: Uint8Array; w: number; h: number }>();
  // Los conduces repiten el mismo código en varias líneas; rasterizarlo una vez.
  const cacheBarras = new Map<string, { data: Uint8Array; w: number; h: number } | null>();
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const codigo = img.getAttribute('data-barcode') ?? '';
    const src    = img.getAttribute('src') ?? '';
    let bmp: { data: Uint8Array; w: number; h: number } | null = null;
    if (codigo) {
      // Code128 del conduce: se rasteriza desde el VALOR, no desde el <img>.
      // Un Code128 reescalado deja de escanear.
      if (!cacheBarras.has(codigo)) cacheBarras.set(codigo, await _renderBarcodeToBitmap(codigo));
      bmp = cacheBarras.get(codigo) ?? null;
    } else if (img.getAttribute('alt') === 'QR DGII' && src.startsWith('data:image/')) {
      // QR de verificación de la DGII, al ancho al que se va a imprimir.
      const anchoMm = parseFloat(
        (img.getAttribute('style') ?? '').match(/width:\s*([\d.]+)mm/)?.[1] ?? '19',
      );
      bmp = await _imgDataUrlABitmap(src, Math.round(anchoMm * PUNTOS_POR_MM));
    }
    // El logo se sigue omitiendo en BT: tampoco se imprimía antes, y en 58 mm de
    // ancho real gasta papel y cabezal sin informar de nada.
    if (bmp) bitmaps.set(img, bmp);
  }

  function proc(el: Element, isCentrado = false) {
    const tag = el.tagName.toLowerCase();
    // Las <img> solo se imprimen por Bluetooth si el bucle de arriba les sacó un
    // ráster: el QR de la DGII y el Code128 del conduce. El resto se descarta.
    if (tag === 'img') {
      const bmp = bitmaps.get(el);
      if (bmp) c.bitmap(bmp.data, bmp.w, bmp.h);
      return;
    }
    if (['style', 'script', 'head'].includes(tag)) return;
    if (tag === 'hr') { c.alignLeft(); c.texto(separador('-')); return; }

    const cls      = (el.className ?? '') as string;
    const esLinea  = cls === 'line';
    const esDoble  = cls === 'dbl';
    const esRow    = cls.includes('row');
    const esBold   = cls.includes('bold') || cls.includes('xlarge');
    const esXl     = cls.includes('xlarge');
    const esCentro = cls.includes('center') || isCentrado;
    // .r — la línea de cantidad del formato compacto va pegada a la derecha,
    // debajo del importe al que corresponde.
    const esDerecha = / r( |$)/.test(' ' + cls);

    if (esLinea) { c.alignLeft(); c.texto(separador('.')); return; }
    if (esDoble) { c.alignLeft(); c.texto(separador('=')); return; }
    // Aire en blanco — el bloque de firma se rellena a mano y necesita sitio.
    if (cls.includes('gap')) { c.salto(cls.includes('gap2') ? 2 : 1); return; }

    if (esRow) {
      const spans = Array.from(el.querySelectorAll(':scope > span'));
      if (spans.length >= 2) {
        const izq = spans[0].textContent?.trim() ?? '';
        const der = spans[1].textContent?.trim() ?? '';
        // ESC ! (no GS !) — ver el comentario en doble().
        if (esXl)    c.doble(true);
        else if (esBold) c.bold(true);
        c.alignLeft().texto(lineaLR(izq, der));
        if (esXl)    c.doble(false);
        else if (esBold) c.bold(false);
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

    if (esXl)        c.doble(true);
    else if (esBold) c.bold(true);
    if (esCentro)       c.alignCenter();
    else if (esDerecha) c.alignRight();
    else                c.alignLeft();

    for (const linea of envolver(texto)) {
      c.texto(esCentro ? centrar(linea) : linea);
    }
    if (esXl)        c.doble(false);
    else if (esBold) c.bold(false);
  }

  for (const ch of doc.body.children) proc(ch);
  c.alignLeft().salto(3).cortar();
  return c.build();
}

/** Imprime cualquier HTML térmico del POS en la impresora BT (sin diálogo del navegador). */
export async function imprimirHtmlEnBT(html: string): Promise<void> {
  const bytes = await htmlAEscPos(html);
  await enviarDatos(bytes);
}

/**
 * Impresión de prueba. Dos tickets:
 *
 * 1. Conexión, alineación y doble alto. No arma un ticket de venta de mentira:
 *    sería una segunda plantilla que mantener, que es justo lo que se acaba de
 *    quitar de en medio.
 * 2. Un Code128 como el del conduce, para comprobar en la impresora de verdad
 *    que el ráster sale legible y que un escáner lo lee. Un código de barras que
 *    no escanea es peor que no ponerlo, y eso no se sabe hasta que sale en papel.
 */
export async function imprimirPruebaEscPos(): Promise<void> {
  const c = comandos().init();
  c.alignCenter().bold(true).texto(centrar('PRUEBA DE IMPRESORA')).bold(false);
  c.texto(centrar('HiCloud ERP'));
  c.alignLeft().texto(separador());
  c.texto(lineaLR('Fecha:', fechaRD(ahora())));
  c.texto(lineaLR('Hora:',  horaConSegundos(ahora())));
  c.texto(lineaLR('Impresora:', getNombreImpresora() || 'BT'));
  c.texto(separador());
  c.doble(true).texto(lineaLR('TOTAL:', 'RD$0.00')).doble(false);
  // Si esta línea sale desalineada, el doble alto rompió ESC a en esta impresora.
  c.alignCenter().texto(centrar('Alineacion OK')).alignLeft();
  c.salto(3).cortar();
  await enviarDatos(c.build());

  // Segundo ticket: la prueba del código de barras del conduce.
  const VALOR = 'CON-128';
  const c2 = comandos().init();
  c2.alignCenter().bold(true).texto(centrar('PRUEBA CODIGO DE BARRAS')).bold(false);
  c2.texto(separador('-')).alignLeft();
  const bmp = await _renderBarcodeToBitmap(VALOR);
  if (bmp) c2.bitmap(bmp.data, bmp.w, bmp.h);
  else     c2.texto(centrar('(no se pudo generar)'));
  c2.alignCenter().bold(true).texto(centrar(VALOR)).bold(false);
  c2.texto(separador('-'));
  c2.texto(centrar('Escanealo: debe leer')).texto(centrar(VALOR));
  c2.alignLeft().salto(3).cortar();
  await enviarDatos(c2.build());
}
