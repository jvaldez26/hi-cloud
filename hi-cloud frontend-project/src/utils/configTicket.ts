/**
 * Configuración del ticket del POS — de dónde salen el formato y el logo.
 *
 * Hoy TODA la configuración del POS vive en `empresa.configuracion` (un JSONB
 * libre, una sola fila por empresa). Eso se queda corto en cuanto un cliente
 * tiene dos sucursales con impresoras distintas — ver la deuda anotada en
 * `docs/estado-actual.md`.
 *
 * Por eso la lectura pasa SIEMPRE por aquí, aunque hoy la capa de sucursal esté
 * vacía: `resolverConfigTicket(empresa, null)`. El día que `sucursales` tenga su
 * propio JSONB, se rellena el hueco marcado abajo y ningún sitio que imprima
 * tiene que cambiar. Si en vez de esto cada sitio leyera `empresa.configuracion`
 * a mano, ese día habría que tocar los doce.
 */

import QRCode from 'qrcode';

export type FormatoTicket = 'normal' | 'compacto';

/** Alturas de logo que ofrece el selector. 0 = sin logo. */
export const LOGO_ALTURAS_MM = [25, 11, 0] as const;

export interface ConfigTicket {
  /** Distribución del ticket. Por defecto NORMAL: nadie se encuentra el ticket cambiado sin pedirlo. */
  formato:        FormatoTicket;
  /** Alto máximo del logo en mm. 0 = no se imprime logo. */
  logoAlturaMm:   number;
  /** 58mm | 80mm | bluetooth | carta | ninguna */
  tipoImpresora:  string;
  mensajeTicket?: string;
  politicaDev?:   string;
  /** Si false, el bloque e-CF no se imprime (config `posMostrarEcfEnRecibo`). */
  mostrarEcf:     boolean;
}

/** Lo que hoy se lee de una sucursal. Vacío a propósito: la capa aún no existe. */
export interface SucursalConfigTicket {
  configuracion?: Record<string, unknown> | null;
}

/**
 * Normaliza la altura del logo a una de las opciones vigentes.
 *
 * El selector ofrecía 20/30/40/60 mm. Al pasar a 25/11/0 los clientes que ya
 * tenían un valor viejo guardado seguirían imprimiendo bien (es un número en un
 * `max-height`), pero el `<Select>` les saldría en blanco y el primer guardado
 * les borraría el valor sin avisar. Se redondea al más cercano.
 */
export function normalizarLogoAltura(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return 25;
  if (n === 0) return 0;
  return LOGO_ALTURAS_MM.reduce((mejor, opcion) =>
    Math.abs(opcion - n) < Math.abs(mejor - n) ? opcion : mejor,
  LOGO_ALTURAS_MM[0]);
}

function normalizarFormato(valor: unknown): FormatoTicket {
  return valor === 'compacto' ? 'compacto' : 'normal';
}

/**
 * Resuelve la configuración efectiva del ticket.
 *
 * @param empresa  la empresa con su `configuracion` JSONB
 * @param sucursal la sucursal activa del POS — HOY SIEMPRE `null`
 */
export function resolverConfigTicket(
  empresa?: { configuracion?: Record<string, unknown> | null } | null,
  sucursal?: SucursalConfigTicket | null,
): ConfigTicket {
  const emp = (empresa?.configuracion ?? {}) as Record<string, unknown>;

  // ── Capa de sucursal ───────────────────────────────────────────────────────
  // `sucursales` no tiene columna `configuracion`, así que esto es siempre {}.
  // Cuando exista, aquí no hay que hacer nada más: el spread de abajo ya le da
  // prioridad sobre la empresa.
  const suc = (sucursal?.configuracion ?? {}) as Record<string, unknown>;

  const conf = { ...emp, ...suc };

  return {
    formato:       normalizarFormato(conf.posFormatoTicket),
    // Sin normalizar y con el default de SIEMPRE (20 mm). El valor guardado es la
    // verdad: normalizar aquí le cambiaría el logo a quien nunca abrió la pantalla
    // y a quien tenga 30/40/60 mm guardado, y el formato normal no puede cambiarle
    // el ticket a nadie que no haya pedido el compacto. La normalización a 25/11/0
    // vive solo en el selector de Configuración, donde es una elección del admin.
    logoAlturaMm:  conf.posLogoAltura != null ? Number(conf.posLogoAltura) : 20,
    tipoImpresora: (conf.posTipoImpresora as string | undefined) ?? '80mm',
    mensajeTicket: conf.posMensajeTicket as string | undefined,
    politicaDev:   conf.posPoliticaDev   as string | undefined,
    mostrarEcf:    conf.posMostrarEcfEnRecibo !== false,
  };
}

// ── QR de verificación DGII ──────────────────────────────────────────────────

/** Lado del QR en el ticket, en mm. Medido: el BT ya imprime a 20mm y escanea. */
export const QR_LADO_MM = { normal: 34, compacto: 19 } as const;

/** Puntos por mm de las térmicas del parque (203 dpi). */
const PUNTOS_POR_MM = 8;

/** Zona de silencio, en módulos a cada lado. Es la que ya usa el camino Bluetooth. */
const QR_MARGEN_MODULOS = 2;

/**
 * Genera el PNG del QR de verificación DGII para imprimirlo a `ladoMm`.
 *
 * Único sitio donde se genera ese QR. Antes cada punto de impresión lo pedía
 * por su cuenta con `width: 130, margin: 1`, y bastaba que uno se quedara atrás
 * para que el mismo ticket saliera distinto según por dónde se imprimiera.
 *
 * El ancho en píxeles sale de contar los módulos REALES del QR y multiplicarlos
 * por una escala entera. Importa que sea entera: si no, el reescalado reparte
 * los módulos en 2 y 3 píxeles sin criterio y se emborrona justo en el borde de
 * cada uno, que es donde el lector se apoya. La URL de la DGII (~200 caracteres,
 * corrección M) sale versión 10 — 57 módulos + 4 de margen = 61 → 61 × 3 = 183 px
 * para un QR de 19 mm. Si la URL crece y sube de versión, esto lo sigue solo.
 *
 * La corrección de errores se queda en **M**. Bajarla a L daría módulos más
 * gordos gastando menos papel, pero en térmica la tinta débil y las manchas son
 * la norma, no la excepción: un QR que no escanea no ahorra papel, genera
 * reimpresiones.
 */
export async function generarQrTicket(url: string, formato: FormatoTicket): Promise<string> {
  if (formato === 'normal') {
    // Bit a bit lo que se imprimía antes del modo compacto: 130 px y margen 1.
    // Normal es el formato por defecto; su ticket no puede moverse ni un pelo
    // porque alguien haya añadido un formato nuevo al lado.
    return QRCode.toDataURL(url, { width: 130, margin: 1, errorCorrectionLevel: 'M' });
  }
  const ladoMm = QR_LADO_MM[formato];
  const modulos = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules.size
    + QR_MARGEN_MODULOS * 2;
  const puntosImpresora = Math.round(ladoMm * PUNTOS_POR_MM);
  const escala = Math.max(2, Math.round(puntosImpresora / modulos));
  return QRCode.toDataURL(url, {
    width:  modulos * escala,
    margin: QR_MARGEN_MODULOS,
    errorCorrectionLevel: 'M',
  });
}
