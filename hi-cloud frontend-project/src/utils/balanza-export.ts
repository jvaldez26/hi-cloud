/**
 * balanza-export.ts — Generador de archivos de catálogo para balanzas etiquetadoras.
 *
 * Tres codificaciones disponibles:
 *   UTF-8        : nativo del navegador (TextEncoder)
 *   ISO-8859-1   : Latin-1 — cubre todos los caracteres del español (código == code point para 0x00-0xFF)
 *   ASCII        : transliteración de acentos + ñ ANTES de codificar (á→a, é→e, ñ→n…)
 *                  Previene el símbolo ◆ que aparece cuando la balanza no conoce UTF-8.
 *
 * Dos formatos:
 *   CSV   : columnas separadas por un carácter configurable
 *   TXT   : ancho fijo — cada columna ocupa exactamente `ancho` posiciones (pad / truncar)
 */

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type CampoExportacion =
  | 'plu'
  | 'nombre'
  | 'precio'
  | 'iva'
  | 'categoria'
  | 'codigo'
  | 'codigoBarras';

export type FormatoArchivo = 'CSV' | 'TXT';

/** 'Windows-1252' se mapea a ISO-8859-1 en el front (misma cobertura para español). */
export type CodificacionBal = 'UTF-8' | 'ISO-8859-1' | 'Windows-1252' | 'ASCII';

export interface ColumnaExportBal {
  campo:  CampoExportacion;
  titulo: string;
  /** Máx. chars para CSV; ancho exacto (pad/truncar) para TXT. */
  ancho:  number;
}

export interface ConfigExportBal {
  formato:        FormatoArchivo;
  /** Separador de campos: solo para CSV. */
  separador:      string;
  codificacion:   CodificacionBal;
  /** Máximo de caracteres del nombre antes de exportar. */
  limiteNombre:   number;
  columnas:       ColumnaExportBal[];
  /** ¿Incluir fila de encabezados? */
  conEncabezado:  boolean;
}

export interface ProductoCatalogoBal {
  id:           number;
  plu:          number;
  nombre:       string;
  precio:       number;
  iva:          number;
  categoria:    string | null;
  codigo:       string;
  codigoBarras: string | null;
  unidadMedida: string;
}

// ── Metadatos de campos disponibles ──────────────────────────────────────────

export const CAMPOS_DISPONIBLES: {
  campo:        CampoExportacion;
  titulo:       string;
  anchoDefault: number;
  esNumerico:   boolean;
}[] = [
  { campo: 'plu',          titulo: 'PLU',         anchoDefault: 5,  esNumerico: true  },
  { campo: 'nombre',       titulo: 'Nombre',       anchoDefault: 20, esNumerico: false },
  { campo: 'precio',       titulo: 'Precio',       anchoDefault: 8,  esNumerico: true  },
  { campo: 'iva',          titulo: '% IVA',        anchoDefault: 3,  esNumerico: true  },
  { campo: 'categoria',    titulo: 'Categoría',    anchoDefault: 15, esNumerico: false },
  { campo: 'codigo',       titulo: 'Código',       anchoDefault: 10, esNumerico: false },
  { campo: 'codigoBarras', titulo: 'Cód. Barras',  anchoDefault: 13, esNumerico: false },
];

// ── Transliteración ASCII ─────────────────────────────────────────────────────

/** Mapa de caracteres no-ASCII frecuentes en español → equivalente ASCII. */
const TRANS: Record<string, string> = {
  á:'a', à:'a', â:'a', ä:'a', å:'a', ã:'a',
  é:'e', è:'e', ê:'e', ë:'e',
  í:'i', ì:'i', î:'i', ï:'i',
  ó:'o', ò:'o', ô:'o', ö:'o', õ:'o', ø:'o',
  ú:'u', ù:'u', û:'u', ü:'u',
  ý:'y', ÿ:'y', ñ:'n', ç:'c', ß:'ss',
  Á:'A', À:'A', Â:'A', Ä:'A', Å:'A', Ã:'A',
  É:'E', È:'E', Ê:'E', Ë:'E',
  Í:'I', Ì:'I', Î:'I', Ï:'I',
  Ó:'O', Ò:'O', Ô:'O', Ö:'O', Õ:'O', Ø:'O',
  Ú:'U', Ù:'U', Û:'U', Ü:'U', Ý:'Y', Ñ:'N', Ç:'C',
  '¡':'!', '¿':'?', '«':'"', '»':'"', '°':' ', '·':'.', '–':'-', '—':'-',
};

function transliterar(s: string): string {
  return s.split('').map(c => TRANS[c] ?? c).join('');
}

// ── Funciones de codificación ─────────────────────────────────────────────────

/**
 * Codifica la cadena como ISO-8859-1 / Windows-1252.
 * Para el español, el rango 0xA0-0xFF coincide en ambas codificaciones
 * (á=0xE1, é=0xE9, í=0xED, ó=0xF3, ú=0xFA, ü=0xFC, ñ=0xF1, etc.).
 * Cualquier carácter fuera de 0x00-0xFF se reemplaza con '?' (0x3F).
 */
function encodeISO88591(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const cp = s.charCodeAt(i);
    out[i] = cp <= 0xFF ? cp : 0x3F; // '?'
  }
  return out;
}

/**
 * Codifica la cadena como ASCII puro:
 *   1. Transliteración (á→a, ñ→n, etc.)
 *   2. Cualquier carácter restante > 0x7F → '?'
 */
function encodeASCII(s: string): Uint8Array {
  const t = transliterar(s);
  const out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) {
    const cp = t.charCodeAt(i);
    out[i] = cp <= 0x7F ? cp : 0x3F; // '?'
  }
  return out;
}

/**
 * Convierte una cadena a bytes según la codificación indicada.
 * Para UTF-8 usa TextEncoder nativo.
 * Para ISO-8859-1 y Windows-1252 usa la misma función (mismo mapa 0x00-0xFF).
 * Para ASCII transliteración previa.
 */
export function encodeString(s: string, codificacion: CodificacionBal): Uint8Array {
  if (codificacion === 'UTF-8') return new TextEncoder().encode(s);
  if (codificacion === 'ASCII') return encodeASCII(s);
  return encodeISO88591(s); // ISO-8859-1 o Windows-1252 — mismos bytes para español
}

// ── Extracción de valores de campo ────────────────────────────────────────────

function getValorCampo(
  producto: ProductoCatalogoBal,
  campo:    CampoExportacion,
  limiteNombre: number,
): string {
  switch (campo) {
    case 'plu':           return String(producto.plu);
    case 'nombre':        return producto.nombre.slice(0, limiteNombre);
    case 'precio':        return producto.precio.toFixed(2);
    case 'iva':           return String(producto.iva ?? 0);
    case 'categoria':     return producto.categoria ?? '';
    case 'codigo':        return producto.codigo ?? '';
    case 'codigoBarras':  return producto.codigoBarras ?? '';
    default:              return '';
  }
}

// ── Formateo de fila ──────────────────────────────────────────────────────────

function esCampoNumerico(campo: CampoExportacion): boolean {
  return campo === 'plu' || campo === 'precio' || campo === 'iva';
}

function formatearFila(producto: ProductoCatalogoBal, config: ConfigExportBal): string {
  const vals = config.columnas.map(col =>
    getValorCampo(producto, col.campo, config.limiteNombre),
  );

  if (config.formato === 'CSV') {
    // Escapar valores que contienen el separador con comillas dobles
    return vals
      .map(v => v.includes(config.separador) ? `"${v.replace(/"/g, '""')}"` : v)
      .join(config.separador);
  }

  // Ancho fijo: truncar o rellenar hasta col.ancho
  return config.columnas
    .map((col, i) => {
      const v = vals[i].slice(0, col.ancho); // truncar si supera el ancho
      return esCampoNumerico(col.campo)
        ? v.padStart(col.ancho, ' ')          // números: alinear a la derecha
        : v.padEnd(col.ancho, ' ');           // texto:   alinear a la izquierda
    })
    .join('');
}

function formatearEncabezado(config: ConfigExportBal): string {
  if (config.formato === 'CSV') {
    return config.columnas
      .map(col => col.titulo.includes(config.separador) ? `"${col.titulo}"` : col.titulo)
      .join(config.separador);
  }
  return config.columnas
    .map(col => {
      const t = col.titulo.slice(0, col.ancho);
      return esCampoNumerico(col.campo)
        ? t.padStart(col.ancho, ' ')
        : t.padEnd(col.ancho, ' ');
    })
    .join('');
}

// ── Exportación completa ──────────────────────────────────────────────────────

/**
 * Genera el archivo completo como `Uint8Array` listo para descargar.
 * Usa `\r\n` como fin de línea (compatibilidad máxima con balanzas y Excel).
 */
export function generarExportacion(
  productos:  ProductoCatalogoBal[],
  config:     ConfigExportBal,
): { bytes: Uint8Array; nombreArchivo: string; mimeType: string } {
  const EOL = '\r\n';
  const lineas: string[] = [];

  if (config.conEncabezado) lineas.push(formatearEncabezado(config));
  for (const prod of productos)  lineas.push(formatearFila(prod, config));

  // Codificar cada línea (incluyendo su EOL)
  const partes: Uint8Array[] = lineas.map(l => encodeString(l + EOL, config.codificacion));

  const totalBytes = partes.reduce((s, p) => s + p.length, 0);
  const bytes      = new Uint8Array(totalBytes);
  let   offset     = 0;
  for (const p of partes) {
    bytes.set(p, offset);
    offset += p.length;
  }

  const ext      = config.formato === 'CSV' ? 'csv' : 'txt';
  const mimeType = config.codificacion === 'UTF-8'
    ? `text/plain;charset=utf-8`
    : `application/octet-stream`;

  return { bytes, nombreArchivo: `catalogo-balanza.${ext}`, mimeType };
}

/**
 * Genera una vista previa de texto (UTF-8, primeras `filas` filas),
 * útil para mostrar en un `<pre>` antes de descargar.
 */
export function previsualizarExportacion(
  productos: ProductoCatalogoBal[],
  config:    ConfigExportBal,
  filas = 8,
): string {
  const previewConfig: ConfigExportBal = { ...config, codificacion: 'UTF-8' };
  const lineas: string[] = [];
  if (config.conEncabezado) lineas.push(formatearEncabezado(previewConfig));
  for (const prod of productos.slice(0, filas)) {
    lineas.push(formatearFila(prod, previewConfig));
  }
  return lineas.join('\n');
}

/**
 * Dispara la descarga de un `Uint8Array` como archivo en el navegador.
 */
export function descargar(bytes: Uint8Array, nombre: string, mimeType: string): void {
  // new Uint8Array(n) produce Uint8Array<ArrayBuffer> que sí es BlobPart válido.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
