import { MetodoPago } from '../common/enums/metodo-pago.enum';

/** Tabla oficial DGII — Tipos de bienes y servicios para Formato 606 */
export const TIPOS_BIENES_606: Record<string, string> = {
  '01': 'Gastos de personal',
  '02': 'Trabajo, suministros y servicios',
  '03': 'Arrendamientos',
  '04': 'Gastos de activos fijos',
  '05': 'Gastos de representación',
  '06': 'Otras deducciones admitidas',
  '07': 'Gastos financieros',
  '08': 'Gastos extraordinarios',
  '09': 'Compras y gastos del costo de venta',
  '10': 'Adquisiciones de activos',
  '11': 'Gastos de seguros',
};

/** Tabla oficial DGII — Formas de pago */
export const FORMAS_PAGO_DGII: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Cheque / Transferencia / Depósito',
  '03': 'Tarjeta de Débito / Crédito',
  '04': 'Compra a Crédito',
  '05': 'Permuta',
  '06': 'Nota de Crédito',
  '07': 'Mixto',
};

/** Tabla oficial DGII — Tipos de ingreso para Formato 607 */
export const TIPOS_INGRESO_607: Record<string, string> = {
  '01': 'Ingresos por operaciones (no financieros)',
  '02': 'Ingresos financieros',
  '03': 'Ingresos extraordinarios',
  '04': 'Ingresos por arrendamientos',
  '05': 'Ingresos por venta de activos depreciables',
  '06': 'Otros ingresos',
};

/**
 * Traduce una forma de pago al código DGII ('01'-'06'). Un solo traductor
 * para 606 y 607, en vez de una copia por formato:
 *
 *   - string/MetodoPago: el enum real de PagoRealizado
 *     (common/enums/metodo-pago.enum.ts, el mismo que usa CxP al registrar
 *     un pago a proveedor). Match exacto, no adivinanza por substring — la
 *     versión anterior de esta función nunca se llamaba desde ningún lado
 *     (código muerto) y encima tenía un bug: 'otro' caía en el fallback y
 *     se reportaba como '01' Efectivo, silenciosamente incorrecto.
 *   - number: el tipo DGII-nativo que ya guarda Factura.formasPago (desde
 *     el trabajo del e-CF) — 1 Efectivo, 2 Cheque/Transferencia/Depósito,
 *     3 Tarjeta, 4 Crédito, 5 Permuta, 6 Nota de Crédito. Es el dato real
 *     que alimenta el desglose del Formato 607.
 *
 * 'otro' (y cualquier valor no reconocido, en cualquiera de los dos
 * dominios) devuelve null a propósito: no hay código DGII confiable, y
 * asumir uno en silencio es exactamente el tipo de error que esta función
 * existe para eliminar. El caller decide qué hacer con null (típicamente:
 * dejar la clasificación existente, no pisarla con una suposición).
 */
export function mapFormaPagoDgii(metodo: MetodoPago | string | number | undefined | null): string | null {
  if (typeof metodo === 'number') {
    switch (metodo) {
      case 1: return '01'; // Efectivo
      case 2: return '02'; // Cheque/Transferencia/Depósito
      case 3: return '03'; // Tarjeta
      case 4: return '04'; // Crédito
      case 5: return '05'; // Permuta
      case 6: return '06'; // Nota de Crédito
      default: return null;
    }
  }
  switch (metodo) {
    case MetodoPago.EFECTIVO:      return '01';
    case MetodoPago.TRANSFERENCIA: return '02';
    case MetodoPago.CHEQUE:        return '02';
    case MetodoPago.TARJETA:       return '03';
    default:                       return null; // 'otro', vacío, o algo no reconocido
  }
}

/**
 * Columna del desglose de forma de pago del Formato 607 (campos 17-23) para
 * un código DGII ya traducido por mapFormaPagoDgii(). 'Nota de Crédito'
 * (06) no tiene columna propia en el 607 — cae en "otras" (23), el cajón
 * oficial de DGII para lo que no encaja en las demás. 'Bonos o
 * Certificados de Regalo' (columna 21) no tiene tipo de formasPago que le
 * corresponda hoy — queda siempre en 0 hasta que exista uno.
 */
export function columna607PorCodigoDgii(
  codigo: string | null,
): 'efectivo' | 'chequeTransferencia' | 'tarjeta' | 'credito' | 'permuta' | 'otras' | null {
  switch (codigo) {
    case '01': return 'efectivo';
    case '02': return 'chequeTransferencia';
    case '03': return 'tarjeta';
    case '04': return 'credito';
    case '05': return 'permuta';
    case '06': return 'otras';
    default:   return null;
  }
}

/**
 * Traduce la etiqueta del botón que pulsó el cajero ('Efectivo', 'Tarjeta',
 * ...) al tipo numérico DGII-nativo que espera Factura.formasPago (1-6).
 * Antes vivía duplicado, byte a byte, como método privado en
 * cotizaciones.service.ts y pre-factura.service.ts — un solo traductor
 * para los dos.
 */
export function tipoFormaPagoDesdeEtiqueta(metodoPago: string): number | undefined {
  switch (metodoPago.trim().toLowerCase()) {
    case 'efectivo':      return 1;
    case 'transferencia':
    case 'cheque':        return 2;
    case 'tarjeta':       return 3;
    case 'crédito':
    case 'credito':       return 4;
    default:              return undefined;
  }
}

/**
 * Resuelve la forma de pago DGII de una compra a partir de TODOS sus pagos
 * reales (PagoRealizado.metodoPago — puede haber varios, uno por cada abono
 * parcial contra la CxP). "Mixto" se decide sobre el CÓDIGO DGII ya
 * traducido, no sobre el enum crudo de HiCloud: cheque y transferencia son
 * métodos distintos para nosotros pero el MISMO código DGII ('02'), así que
 * pagar parte por cheque y parte por transferencia no es "mixto" para
 * DGII — sí lo es pagar parte en efectivo y parte por transferencia
 * ('01' vs '02'), donde no hay forma correcta de elegir "el más reciente"
 * o "el primero" sin falsear cómo se pagó realmente.
 *
 * Los métodos sin traducción confiable ('otro') se ignoran para esta
 * resolución en vez de forzar un null total — si hay al menos un pago con
 * código DGII conocido, se usa ese; solo cuando NINGÚN pago tiene una
 * traducción confiable (o no hay pagos) se devuelve null y no se pisa lo
 * que la compra ya tenía.
 */
export function resolverFormaPagoCompra(metodos: (MetodoPago | string)[]): string | null {
  const codigos = metodos
    .map(m => mapFormaPagoDgii(m))
    .filter((c): c is string => c !== null);
  if (codigos.length === 0) return null;
  const unicos = [...new Set(codigos)];
  if (unicos.length > 1) return '07'; // Mixto
  return unicos[0];
}

/** Tipo de ingreso para 607 — ventas normales = '01' */
export function mapTipoIngreso607(tipoNcf: string | undefined | null): string {
  switch (tipoNcf) {
    case 'E44': return '01'; // zona franca → operaciones
    case 'E45': return '01'; // gubernamental → operaciones
    case 'E46':
    case 'E47': return '01'; // exportaciones → operaciones
    case 'E33':
    case 'E34': return '01'; // nota de débito/crédito → mismo tipo de ingreso que la factura que modifica
    default:    return '01'; // E31, E32 → operaciones normales
  }
}

/** Monto a entero sin decimales (centavos DGII: x100, luego redondear) */
export function montoEntero(valor: number | string | undefined | null): number {
  return Math.round(Number(valor ?? 0) * 100);
}

/** Fecha al formato AAAAMMDD requerido por DGII */
export function fechaDgii(d: Date | string | undefined | null): string {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y  = dt.getFullYear();
  const m  = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

// ── Fase 2 del catálogo fiscal dominicano — sugerencias por nombre de cuenta ──
// Diccionario de palabras clave, no autoridad: sugerirTipoGasto606()/
// sugerirRequiereNCF() devuelven null cuando ninguna calza, y el caller
// decide (típicamente: dejar la cuenta sin esa etiqueta y reportarlo — ver
// PLAN_CUENTAS en contabilidad.service.ts, que es quien las usa para el
// seed). Construido a partir del diagnóstico de Fase 2 (2026-09-19, 35
// empresas, 100% del catálogo idéntico al seed): con este diccionario, 13
// de las 14 cuentas de gasto/costo del seed reciben tipoGasto606 — la única
// sin sugerencia, "ITBIS no Recuperable", queda así a propósito (ningún
// keyword la cubre): es genuinamente ambigua, pendiente de confirmar con el
// contador antes de la Fase 3.

function normalizarNombreCuenta(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const REGLAS_TIPO_GASTO_606: { codigo: string; kw: string[] }[] = [
  // Más específico primero — sin esto, "Comisiones Bancarias" caería en el
  // '01' genérico de "comision" antes de llegar a '07'.
  { codigo: '07', kw: ['interes bancario', 'intereses bancarios', 'comision bancaria', 'comisiones bancarias', 'gasto bancario', 'gastos bancarios', 'gasto financiero', 'gastos financieros', 'diferencial cambiario', 'perdida cambiaria', 'perdida en cambio'] },
  { codigo: '01', kw: ['sueldo', 'salario', 'nomina', 'comision', 'vacacion', 'bonificac', 'incentivo', 'gratificac', 'seguro medico', 'seguro de salud', 'seguro familiar', 'tss', 'infotep', 'riesgo laboral', 'pension', 'prestacion laboral'] },
  { codigo: '03', kw: ['alquiler', 'arrendamiento', 'renta de local'] },
  { codigo: '04', kw: ['depreciacion', 'amortizacion', 'mantenimiento de vehiculo', 'mantenimiento de equipo', 'reparacion de activo'] },
  // 'seguro' genérico va AL FINAL de este bucket — las frases específicas de
  // arriba siguen ganando cuando calzan, y '01' (seguro familiar/de salud,
  // TSS) ya se revisó antes que este bucket, así que no hay colisión.
  { codigo: '11', kw: ['seguro de propiedad', 'seguro de vehiculo', 'poliza de seguro', 'seguro contra incendio', 'seguro'] },
  { codigo: '05', kw: ['representacion', 'atencion a clientes', 'regalo corporativo'] },
  { codigo: '06', kw: ['donacion', 'membresia', 'cuota de asociacion'] },
  { codigo: '08', kw: ['extraordinario', 'siniestro', 'perdida por'] },
  { codigo: '10', kw: ['adquisicion de activo', 'compra de equipo', 'compra de vehiculo', 'mobiliario'] },
  { codigo: '09', kw: ['costo de venta', 'costo de ventas', 'costo de produccion', 'compra de mercancia', 'materia prima', 'inventario'] },
  { codigo: '02', kw: ['servicio', 'suministro', 'mantenimiento', 'honorario', 'consultoria', 'limpieza', 'seguridad', 'publicidad', 'marketing', 'papeleria', 'transporte', 'combustible', 'electricidad', 'agua', 'telefono', 'internet', 'comunicacion', 'comunicaciones', 'material de oficina', 'materiales de oficina'] },
];

/** Sugiere un código del Formato 606 (TIPOS_BIENES_606) a partir del nombre de una cuenta de gasto o costo. null = ningún keyword calzó. */
export function sugerirTipoGasto606(nombreCuenta: string): string | null {
  const n = normalizarNombreCuenta(nombreCuenta);
  for (const regla of REGLAS_TIPO_GASTO_606) {
    if (regla.kw.some(k => n.includes(k))) return regla.codigo;
  }
  return null;
}

// Van SIN NCF, según el material de capacitación: nómina y sus derivados
// TSS (comisiones, vacaciones, horas extras, salario de navidad,
// bonificaciones, incentivos, gratificaciones), aportaciones a pensiones/
// seguro familiar de salud/riesgo laboral/INFOTEP, depreciación de activos
// fijos, destrucción de inventario autorizada por DGII. Todo lo demás CON
// NCF — pero el costo de venta/producción y los cargos bancarios (interés,
// comisión) no están en ninguna de las dos listas del material: se
// devuelve null en vez de forzar "con NCF" por defecto sobre algo dudoso.
// 'gasto menor' se agrega a propósito: es el régimen E43 (comprobantes por
// debajo del umbral que DGII exime de NCF del proveedor) — ni siquiera es
// parte del 606, así que "requiere NCF" sería literalmente falso, no solo
// impreciso.
const SIN_NCF_KW = ['sueldo', 'salario', 'nomina', 'comision', 'vacacion', 'bonificac', 'incentivo', 'gratificac', 'tss', 'infotep', 'riesgo laboral', 'pension', 'seguro familiar', 'seguro de salud', 'depreciacion', 'destruccion de inventario', 'gasto menor'];
// 'impuestos y tasas' se agrega a propósito: puede incluir tasas municipales
// u otros cargos gubernamentales que nunca traen NCF de un proveedor — y
// también impuestos que sí vienen facturados. Ambiguo de verdad, no se
// asume ninguno de los dos.
const AMBIGUOS_NCF_KW = ['comision bancaria', 'comisiones bancarias', 'interes bancario', 'intereses bancarios', 'itbis no recuperable', 'costo de venta', 'costo de ventas', 'costo de produccion', 'diferencial cambiario', 'perdida cambiaria', 'perdida en cambio', 'impuestos y tasas'];

/**
 * Sugiere el valor de requiereNCF a partir del nombre de una cuenta de
 * gasto o costo. true = necesita NCF, false = va sin NCF, null = no hay
 * criterio confiable (el caller debe dejarla sin etiquetar, no asumir).
 */
export function sugerirRequiereNCF(nombreCuenta: string): boolean | null {
  const n = normalizarNombreCuenta(nombreCuenta);
  if (AMBIGUOS_NCF_KW.some(k => n.includes(k))) return null;
  if (SIN_NCF_KW.some(k => n.includes(k))) return false;
  return true;
}

// ── Fase 3 del catálogo fiscal dominicano — correspondencia 606 ↔ IR-2 ──────
// Tabla de referencia, no de cálculo: documenta qué casilla del IR-2 (y de
// qué Anexo) corresponde a cada uno de los 11 códigos del Formato 606, según
// el instructivo oficial IR-2 (dgii.gov.do) y el material de capacitación
// del Lic. Wilton Andrés Pérez. `confirmada=true` solo en las 6 casillas
// donde el instructivo dice textualmente que esa partida "debe ser remitida
// en el Formato 606" — las otras 5 son criterio del material de
// capacitación, sin nota equivalente en el instructivo, y se marcan
// `confirmada=false` a propósito: el contador decide si el cruce aplica,
// esta tabla no lo declara firme.
//
// La investigación de Fase 3 (2026-09) no encontró evidencia — ni en el
// instructivo ni en fuentes externas — de que DGII valide automáticamente
// el IR-2 contra los 606 enviados. Esta tabla y la pantalla que la usa son
// una ayuda de control interno para el contador, no una simulación de una
// validación de DGII que no está confirmado que exista.
export interface CorrespondenciaIR2 {
  codigo606: string;
  /** Número de casilla del anexo del IR-2, o null si el material de capacitación no propone ninguna. */
  casillaIR2: string | null;
  anexoIR2: 'A1' | 'B1' | 'D' | null;
  /** true = el instructivo oficial IR-2 remite textualmente al Formato 606 para esta partida. */
  confirmada: boolean;
  /** Aclaración puntual sobre la fuente, cuando aplica (ej. colisión de nombre de casilla). */
  nota?: string;
}

export const CORRESPONDENCIA_606_IR2: CorrespondenciaIR2[] = [
  { codigo606: '01', casillaIR2: '6',  anexoIR2: 'B1', confirmada: false },
  {
    codigo606: '02', casillaIR2: '7', anexoIR2: 'B1', confirmada: true,
    nota: 'Casilla 7 del Anexo B-1 (Estado de Resultados) — existe otra casilla 7 en el formulario ' +
          'principal del IR-2 ("Renta Neta Imponible antes de pérdida") que NO tiene relación con el 606; no confundirlas.',
  },
  { codigo606: '03', casillaIR2: '8',  anexoIR2: 'B1', confirmada: false },
  { codigo606: '04', casillaIR2: '9',  anexoIR2: 'B1', confirmada: false },
  { codigo606: '05', casillaIR2: '10', anexoIR2: 'B1', confirmada: true },
  { codigo606: '06', casillaIR2: '11', anexoIR2: 'B1', confirmada: true },
  { codigo606: '07', casillaIR2: '12', anexoIR2: 'B1', confirmada: true },
  { codigo606: '08', casillaIR2: '13', anexoIR2: 'B1', confirmada: true },
  { codigo606: '09', casillaIR2: '35', anexoIR2: 'D',  confirmada: true },
  { codigo606: '10', casillaIR2: null, anexoIR2: null, confirmada: false },
  { codigo606: '11', casillaIR2: null, anexoIR2: null, confirmada: false },
];

/** Valida formato RNC (9 dígitos) */
export function esRncValido(rnc: string | undefined | null): boolean {
  return /^\d{9}$/.test((rnc ?? '').trim());
}

/** Valida formato cédula (11 dígitos) */
export function esCedulaValida(cedula: string | undefined | null): boolean {
  return /^\d{11}$/.test((cedula ?? '').trim());
}

/** Detecta si un valor es RNC (9), cédula (11), pasaporte u otro */
export function tipoIdDgii(valor: string | undefined | null): '1' | '2' | '3' | '' {
  const v = (valor ?? '').replace(/\D/g, '');
  if (v.length === 9)  return '1'; // RNC
  if (v.length === 11) return '2'; // Cédula
  if (v.length > 0)    return '3'; // Pasaporte u otro
  return '';
}
