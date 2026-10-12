/**
 * Bloque "FACTURAS EMITIDAS" del ticket térmico del cierre de caja.
 *
 * Vive aquí y no dentro de cada pantalla porque hay DOS plantillas térmicas
 * independientes —la del POS (buildCierreCajaHTML) y la de CajaPage
 * (imprimirCierre)— y este bloque tiene que salir idéntico en las dos. Escrito
 * dos veces, divergen; ya sabemos cómo acaba eso.
 *
 * Los datos vienen TAL CUAL de GET /caja/:id/facturas-detalle, el mismo
 * endpoint que alimentan el PDF y el Excel. Aquí no se calcula ningún monto:
 * solo se formatea. Si el ticket sumara por su cuenta, acabaría discrepando de
 * los otros dos formatos ante la misma caja.
 *
 * Tamaño de letra (requisito de negocio 2026-10-11, mismo criterio que
 * cuadreFormaPagoTermico.ts): la línea principal de cada factura (folio +
 * monto) usa `.row`, la MISMA clase que ya imprime "Gastos:"/"Retiros:" en
 * la plantilla — nada de font-size propio. Hora y método de pago, al ser un
 * dato secundario (igual que "RNC: ..." bajo el nombre de la empresa, que ya
 * usa `.small` en toda la plantilla), sí usan `.small` — esa es la MISMA
 * clase que atenúa el resto de los datos secundarios del ticket, no un
 * tamaño inventado para esta tabla.
 */

import { sanear } from '../services/thermalPrinter';

/** Forma exacta de lo que devuelve el endpoint. */
export interface FacturaDetalleTermico {
  folio:      string;
  encf:       string | null;
  hora:       string;
  formasPago: { tipo: number; monto: number }[];
  total:      number;
  cancelada:  boolean;
}

export interface DetalleCierreTermico {
  facturas: FacturaDetalleTermico[];
  resumen?: {
    totalFacturas:   number;
    totalCanceladas: number;
    total:           number;
  };
}

/** Etiquetas DGII de forma de pago — mismas que usa el backend. */
const PAGO_CORTO: Record<number, string> = {
  1: 'EFEC', 2: 'TRANS', 3: 'TARJ', 4: 'CRED', 5: 'PERM', 6: 'NC',
};

/**
 * Método de pago en corto. En 80 mm no caben "Transferencia" ni varias formas
 * escritas enteras, y partir la línea rompe la lectura de la columna de montos.
 */
function metodoCorto(fps: { tipo: number; monto: number }[]): string {
  if (!fps || fps.length === 0) return '—';
  if (fps.length === 1) return PAGO_CORTO[fps[0].tipo] ?? `T${fps[0].tipo}`;
  return 'MIXTO';
}

// sanear() antes del escape — sin tildes ni caracteres especiales en ningún
// dato del ticket térmico, en ningún canal (no solo camino Bluetooth).
const esc = (s: unknown) =>
  sanear(String(s ?? '')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const money = (v: number) =>
  Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Sin comas de millar: a 58mm, "Total facturado:" + un monto con comas puede
// no caber en una sola línea de `.row` (mismo ancho que el resto del ticket,
// sin tamaño propio) y partirse a media palabra. Igual que ya hace el cuadre
// por forma de pago a 58mm (ver cuadreFormaPagoTermico.ts, TABLA_58MM.comas).
const moneySinComas = (v: number) =>
  Number(v ?? 0).toFixed(2);

/**
 * Hora en zona RD. Igual que en el resto del ERP: el locale elige el formato,
 * no la zona, y sin fijarla un equipo mal configurado imprime otra hora.
 */
function horaRD(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-DO', {
      timeZone: 'America/Santo_Domingo',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return ''; }
}

const plural = (n: number, sing: string, plur: string) => `${n} ${n === 1 ? sing : plur}`;

/**
 * Línea final: dice que el ticket viene completo.
 *
 * Cuando hay anuladas se desglosa en la misma línea —"3 líneas impresas
 * (2 emitidas + 1 anulada)"— porque si no, ese 3 no cuadra con el "Facturas
 * emitidas: 2" de arriba y quien lee el papel tiene que adivinar por qué. Con
 * el desglose delante, la resta está hecha.
 *
 * Los números salen del array que se acaba de imprimir, no del resumen del
 * backend: así la suma del paréntesis SIEMPRE cuadra con el total de la línea.
 * Si alguna vez difiriera del "Facturas emitidas" de arriba, esa discrepancia
 * es justo lo que hay que ver, no algo que tapar aquí.
 */
function lineaImpresas(facturas: FacturaDetalleTermico[]): string {
  const total    = facturas.length;
  const anuladas = facturas.filter(f => f.cancelada).length;
  const emitidas = total - anuladas;

  if (anuladas === 0) return plural(total, 'factura impresa', 'facturas impresas');

  return `${plural(total, 'línea impresa', 'líneas impresas')} ` +
         `(${plural(emitidas, 'emitida', 'emitidas')} + ${plural(anuladas, 'anulada', 'anuladas')})`;
}

/**
 * Devuelve el HTML del bloque, o cadena vacía si no hay facturas.
 *
 * Va DESPUÉS del resumen, que no se toca.
 *
 * Las anuladas se incluyen marcadas, nunca se esconden: un cierre que omite las
 * anuladas no sirve para auditar. Se muestran con su monto original tachado y
 * NO suman en el total del bloque, para que ese total cuadre contra el resumen
 * —que también las excluye—.
 *
 * La última línea, "N facturas impresas", SÍ las cuenta: sirve para saber que
 * el ticket trae todas y no viene recortado. No se imprime ningún tope — un
 * cierre a medias no sirve para cuadrar, y quien quiera algo más corto tiene
 * el PDF y el Excel.
 */
export function bloqueFacturasTermico(
  detalle: DetalleCierreTermico | null | undefined,
  tipoImpresora?: string,
): string {
  const facturas = detalle?.facturas ?? [];
  if (facturas.length === 0) return '';

  // Dos líneas por factura: folio + monto con `.row` (la MISMA clase que
  // "Gastos:"/"Retiros:" — flexbox ya alinea el monto a la derecha, sin
  // tamaño propio) y, debajo, hora + método con `.small` (dato secundario,
  // igual que "RNC: ..." bajo el nombre de la empresa, que ya usa `.small`
  // en toda la plantilla).
  const filas = facturas.map(f => {
    const folio  = `${f.folio}${f.cancelada ? ' ANULADA' : ''}`;
    const clase  = `row${f.cancelada ? ' fe-anulada' : ''}`;
    return (
      `<div class="${clase}"><span>${esc(folio)}</span><span>${esc(money(f.total))}</span></div>` +
      `<div class="small${f.cancelada ? ' fe-anulada' : ''}">${esc(horaRD(f.hora))} - ${esc(metodoCorto(f.formasPago))}</div>`
    );
  }).join('');

  // Los totales salen del resumen del backend. Solo si faltara se calculan
  // aquí, y con el mismo criterio: las anuladas no suman.
  const activas   = facturas.filter(f => !f.cancelada);
  const nEmitidas = detalle?.resumen?.totalFacturas   ?? activas.length;
  const nAnuladas = detalle?.resumen?.totalCanceladas ?? (facturas.length - activas.length);
  const suma      = detalle?.resumen?.total           ?? activas.reduce((s, f) => s + Number(f.total), 0);
  const montoTotal = tipoImpresora === '58mm' ? moneySinComas(suma) : money(suma);

  return `
    <div class="sep">--------------------------------</div>
    <div class="small bold">FACTURAS EMITIDAS</div>
    ${filas}
    <div class="sep">--------------------------------</div>
    <div class="row"><span>Facturas emitidas:</span><span>${nEmitidas}</span></div>
    ${nAnuladas > 0 ? `<div class="row"><span>Anuladas (no suman):</span><span>${nAnuladas}</span></div>` : ''}
    <div class="row bold"><span>Total facturado:</span><span>RD$${esc(montoTotal)}</span></div>
    <div class="center small">${lineaImpresas(facturas)}</div>
  `;
}

/**
 * CSS del bloque. Se inyecta una sola vez en el <style> de la plantilla.
 *
 * Solo lo que NINGUNA clase ya definida en la plantilla cubre: el tachado
 * de las anuladas. Todo lo demás (tamaño de letra, alineación, negrita)
 * sale de `.row`/`.small`/`.bold`, las mismas clases que usa el resto del
 * ticket — así es imposible que este bloque divergiera en tamaño del resto.
 */
export const CSS_FACTURAS_TERMICO = `
  .fe-anulada{text-decoration:line-through;opacity:.6}
`;
