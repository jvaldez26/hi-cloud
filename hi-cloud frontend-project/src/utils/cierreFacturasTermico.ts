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
 */

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

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const money = (v: number) =>
  Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
export function bloqueFacturasTermico(detalle: DetalleCierreTermico | null | undefined): string {
  const facturas = detalle?.facturas ?? [];
  if (facturas.length === 0) return '';

  const filas = facturas.map(f => {
    const clases = `fe-row${f.cancelada ? ' fe-anulada' : ''}`;
    // Una sola línea: número · hora · método · monto. Sin líneas de producto.
    return (
      `<div class="${clases}">` +
        `<span class="fe-num">${esc(f.folio)}${f.cancelada ? ' ANULADA' : ''}</span>` +
        `<span class="fe-hora">${esc(horaRD(f.hora))}</span>` +
        `<span class="fe-pago">${esc(metodoCorto(f.formasPago))}</span>` +
        `<span class="fe-tot">${esc(money(f.total))}</span>` +
      `</div>`
    );
  }).join('');

  // Los totales salen del resumen del backend. Solo si faltara se calculan
  // aquí, y con el mismo criterio: las anuladas no suman.
  const activas   = facturas.filter(f => !f.cancelada);
  const nEmitidas = detalle?.resumen?.totalFacturas   ?? activas.length;
  const nAnuladas = detalle?.resumen?.totalCanceladas ?? (facturas.length - activas.length);
  const suma      = detalle?.resumen?.total           ?? activas.reduce((s, f) => s + Number(f.total), 0);

  return `
    <div class="sep">--------------------------------</div>
    <div class="fe-titulo">FACTURAS EMITIDAS</div>
    <div class="fe-cab">
      <span class="fe-num">FACTURA</span>
      <span class="fe-hora">HORA</span>
      <span class="fe-pago">PAGO</span>
      <span class="fe-tot">MONTO</span>
    </div>
    ${filas}
    <div class="sep">--------------------------------</div>
    <div class="fe-res"><span>Facturas emitidas:</span><span>${nEmitidas}</span></div>
    ${nAnuladas > 0 ? `<div class="fe-res"><span>Anuladas (no suman):</span><span>${nAnuladas}</span></div>` : ''}
    <div class="fe-res fe-bold"><span>Total facturado:</span><span>RD$${esc(money(suma))}</span></div>
    <div class="fe-impresas">${lineaImpresas(facturas)}</div>
  `;
}

/**
 * CSS del bloque. Se inyecta una sola vez en el <style> de la plantilla.
 *
 * Anchos en porcentaje, no en mm: la plantilla ya define el ancho del papel
 * (58 mm, 80 mm o carta) y este bloque se adapta al que haya. No se inventa uno.
 */
export const CSS_FACTURAS_TERMICO = `
  .fe-titulo{font-weight:700;text-align:center;margin:2px 0}
  .fe-cab{display:flex;font-size:.72em;font-weight:700;border-bottom:1px solid #000;padding-bottom:1px}
  .fe-row{display:flex;font-size:.78em;padding:1px 0}
  .fe-row.fe-anulada{text-decoration:line-through;opacity:.6}
  .fe-num{flex:0 0 34%;overflow:hidden;white-space:nowrap}
  .fe-hora{flex:0 0 16%}
  .fe-pago{flex:0 0 20%}
  .fe-tot{flex:1 1 30%;text-align:right;font-variant-numeric:tabular-nums}
  .fe-res{display:flex;justify-content:space-between;font-size:.85em}
  .fe-res.fe-bold{font-weight:700}
  .fe-impresas{text-align:center;font-size:.72em;margin-top:2px}
`;
