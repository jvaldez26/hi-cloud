/**
 * Ticket térmico del POS — la plantilla, y solo la plantilla.
 *
 * Vivía dentro de POSPage.tsx, así que el único que podía dibujar un ticket era
 * el POS. La pantalla de Configuración necesita enseñar los dos formatos antes
 * de que el admin elija, y si para eso se hubiera hecho una maqueta aparte, la
 * vista previa habría empezado a mentir el primer día que cambiara el ticket.
 * Aquí la vista previa llama a la MISMA función que imprime.
 *
 * Los tipos de abajo son un subconjunto estructural de los del POS (`Sale`,
 * `CartItem`): TypeScript los acepta sin conversión y este módulo no tiene que
 * arrastrarse media página del POS para compilar.
 */
import { round2 } from './formatters';
import { dRD } from './fechaRD';
import { IMPRESORA_CONFIG, esc } from './docTermico';
import type { ConfigTicket } from './configTicket';
import { QR_LADO_MM } from './configTicket';

export interface TicketItem {
  produto:           { nombre: string; porcentajeIva?: number };
  cantidad:          number;
  precio:            number;
  descuentoMonto:    number;
  precioModificado?: boolean;
  esBalanza?:        boolean;
  balanzaTipoDato?:  'peso' | 'precio';
  balanzaUnidad?:    string;
  balanzaTotalFijo?: number;
}

export interface TicketSale {
  folio:                   string;
  total:                   number;
  cambio:                  number;
  pagoRecibido?:           number;
  formasPago?:             { tipo: number; monto: number }[];
  metodo:                  string;
  items:                   TicketItem[];
  iva:                     number;
  subtotal:                number;
  tipoNcf?:                string;
  encf?:                   string;
  ecfPendiente?:           boolean;
  ecfFecha?:               string;
  fechaEmision?:           string;
  horaEmision?:            string;
  rncComprador?:           string;
  razonSocial?:            string;
  securityCode?:           string;
  diasCredito?:            number;
  facturaOriginalFolio?:   string;
  ncfOriginal?:            string;
  codigoModificacion?:     string;
  descripcionMotivo?:      string;
  descuentoGlobal?:        number;
  descuentoGlobalFinal?:   number;
  propina?:                number;
  cajero?:                 string;
  sucursalNombre?:         string;
  empresaNombreComercial?: string;
  empresaRnc?:             string;
  empresaDireccion?:       string;
  empresaTelefono?:        string;
  empresaLogo?:            string;
  modoContexto?:           string;
}

/** Etiqueta del método de pago tal como se imprime. */
const METODO_LABEL: Record<string, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  transferencia: 'Transferencia',
  credito:       'Crédito',
  cheque:        'Cheque',
  vale:          'Vale',
};

export const NCF_LABEL: Record<string, [string, string]> = {
  E32: ['FACTURA DE CONSUMO',       'ELECTRÓNICA (E32)'],
  E31: ['FACTURA CRÉDITO FISCAL',   'ELECTRÓNICA (E31)'],
  E34: ['NOTA DE CRÉDITO',          'ELECTRÓNICA (E34)'],
  E44: ['FACTURA RÉGIMEN ESPECIAL', 'ZONA FRANCA (E44)'],
  E45: ['FACTURA GUBERNAMENTAL',    'ELECTRÓNICA (E45)'],
};
const RNC_GENERICOS_TICKET = new Set(['000000000', '00000000000', '']);

/** Agrupa los ítems del carrito por tasa de ITBIS — mismo criterio que el builder ECF.
 *  Devuelve bases imponibles y montos de ITBIS por tasa para el desglose del ticket.
 *  - gravado18: MontoGravadoI1 (base al 18%)
 *  - gravado16: MontoGravadoI2 (base al 16%)
 *  - exento:    MontoExento
 *  - itbis18:   TotalITBIS1
 *  - itbis16:   TotalITBIS2
 *  balanzaTotalFijo es la base pre-ITBIS del ítem de balanza (etiqueta de precio fijo). */
function calcularDesgloseITBIS(items: TicketItem[], esExento: boolean) {
  let g18 = 0, g16 = 0, ext = 0, i18 = 0, i16 = 0;
  for (const item of items) {
    const pct     = esExento ? 0 : Number(item.produto.porcentajeIva ?? 18);
    const descUnit = item.descuentoMonto ?? 0;
    const base    = (item as any).balanzaTotalFijo != null
      ? (item as any).balanzaTotalFijo
      : (item.precio - descUnit) * item.cantidad;
    if (pct === 18)      { g18 += base; i18 += base * 0.18; }
    else if (pct === 16) { g16 += base; i16 += base * 0.16; }
    else                 { ext += base; }
  }
  return {
    gravado18: round2(g18),
    gravado16: round2(g16),
    exento:    round2(ext),
    itbis18:   round2(i18),
    itbis16:   round2(i16),
  };
}

/**
 * Ticket térmico del POS — UNA plantilla, dos distribuciones.
 *
 * `formato` es un PARÁMETRO, no una plantilla aparte. Los datos (desglose de
 * ITBIS, totales, formas de pago, bloque e-CF) se calculan una sola vez arriba;
 * lo único que cambia abajo es cómo se reparten en el papel.
 *
 * El montaje recorre las secciones UNA vez y cada campo aparece exactamente en
 * un `if (compacto) … else …`. Eso es a propósito: es lo que impide que un campo
 * exista en normal y se pierda en compacto sin que nadie lo note. Si añades un
 * campo, lo añades en su sección y decides ahí mismo cómo se ve en los dos.
 *
 * NINGÚN campo desaparece en compacto: comprador con RNC, "MODIFICA A", propina,
 * pago mixto, plazo de crédito, módulo, mensaje del ticket y política de
 * devoluciones siguen imprimiéndose cuando aplican — emparejados en un renglón
 * en vez de uno debajo de otro.
 *
 * Intocables en cualquier formato, por exigencia de la DGII: RNC del emisor,
 * tipo de comprobante, e-NCF, código de seguridad, fecha de firma, QR de
 * verificación y desglose de ITBIS.
 */
export function buildReciboTermicoHTML(
  sale: TicketSale,
  qrDataUrl: string | null,
  cfg: Partial<ConfigTicket> & {
    tipoDoc?:      'PRE-FACTURA' | 'COTIZACIÓN' | 'PRO-FORMA';
    validezDias?:  number;
    /** La sucursal solo se imprime en compacto si la empresa tiene más de una. */
    variasSucursales?: boolean;
    /** true en la vista previa: el ticket no debe abrir el diálogo de impresión solo. */
    soloVista?:    boolean;
  } = {},
): string {
  const {
    mostrarEcf = true, tipoImpresora = '80mm', mensajeTicket, politicaDev,
    tipoDoc, validezDias, formato = 'normal', logoAlturaMm = 25,
    variasSucursales = false, soloVista = false,
  } = cfg;
  const compacto = formato === 'compacto';
  const prn   = IMPRESORA_CONFIG[tipoImpresora] ?? IMPRESORA_CONFIG['80mm'];
  const ahora = dRD();   // hora del SERVIDOR: esto se imprime en el ticket del cliente
  const fmt     = (n: number) => `RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  /** Monto sin el prefijo RD$ — en compacto el prefijo se dice una vez por renglón. */
  const num     = (n: number) => n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const row     = (l: string, v: string) => `<div class="row"><span>${esc(l)}</span><span>${esc(v)}</span></div>`;
  const rowBold = (l: string, v: string) => `<div class="row bold"><span>${esc(l)}</span><span>${esc(v)}</span></div>`;
  const txt     = (t: string) => `<div>${esc(t)}</div>`;
  const small   = (t: string) => `<div class="small">${esc(t)}</div>`;
  const centro  = (t: string) => `<div class="center">${esc(t)}</div>`;
  const line    = () => '<div class="line"></div>';
  const dbl     = () => '<div class="dbl"></div>';

  const tipoCode = sale.tipoNcf ?? 'E32';
  const [ncfL1, ncfL2] = tipoDoc
    ? [tipoDoc, tipoDoc === 'PRE-FACTURA' ? 'Documento No Fiscal' : tipoDoc === 'PRO-FORMA' ? 'Presupuesto Informativo - Sin NCF' : 'No válida como comprobante fiscal']
    : (NCF_LABEL[tipoCode] ?? ['FACTURA ELECTRÓNICA', `(${esc(tipoCode)})`]);
  const esExento = tipoCode === 'E44';
  const mostrarComprador = !!(sale.rncComprador && !RNC_GENERICOS_TICKET.has(sale.rncComprador));
  const metodoLabel = METODO_LABEL[sale.metodo] ?? 'Pago';
  const formasPagoRecibo = sale.formasPago ?? [];
  const esMixtoRecibo    = formasPagoRecibo.length > 1;
  const pagoMostrar = esMixtoRecibo
    ? round2(formasPagoRecibo.reduce((s, fp) => s + fp.monto, 0))
    : (sale.pagoRecibido ?? (sale.metodo === 'efectivo' && sale.cambio > 0 ? sale.total + sale.cambio : sale.total));
  const TIPO_LABEL_RECIBO: Record<number, string> = { 1: 'Efectivo', 2: 'Transferencia', 3: 'Tarjeta', 4: 'Crédito', 5: 'Permuta', 6: 'Nota crédito' };

  const tieneModificados = sale.items.some(i => i.precioModificado);

  // ── Ítems ──────────────────────────────────────────────────────────────────
  // El importe de línea es el NETO de descuento, con ITBIS. Mismo criterio en
  // los dos formatos: lo único que cambia es dónde cae la línea de cantidad.
  const itemsHtml = sale.items.map(item => {
    const ivaPct     = esExento ? 0 : Number(item.produto.porcentajeIva ?? 18) / 100;
    const factor     = 1 + ivaPct;
    const precioNeto = item.precio - item.descuentoMonto;
    // Balanza precio fijo: el total es el embebido en la etiqueta
    const sub        = (item as any).balanzaTotalFijo != null
      ? (item as any).balanzaTotalFijo * factor
      : precioNeto * item.cantidad * factor;
    const maxNom     = compacto ? 22 : 26;
    const nom        = item.produto.nombre.length > maxNom ? item.produto.nombre.slice(0, maxNom - 1) + '…' : item.produto.nombre;
    const modMark    = item.precioModificado ? ' *' : '';
    // Marca de pesable. En Bluetooth el simbolo se cae (no existe en CP437),
    // pero la informacion no se pierde: la linea de detalle siempre la lleva en
    // texto — "12.500 KG x RD$96.00" en modo peso, "Precio fijo etiqueta" en
    // modo precio, donde la balanza no reporta unidad.
    const balMark    = (item as any).esBalanza ? ' ⚖' : '';
    // Cantidad con unidad correcta para balanza
    const cantStr    = (item as any).esBalanza
      ? `${item.cantidad.toFixed(3)} ${(item as any).balanzaUnidad ?? ''}`
      : String(item.cantidad);
    const detalle    = (item as any).balanzaTipoDato === 'precio'
      ? 'Precio fijo etiqueta'
      : `${cantStr} × RD$${(precioNeto * factor).toFixed(2)}`;
    const descTxt    = item.descuentoMonto > 0
      ? `Desc: -RD$${(item.descuentoMonto * factor).toFixed(2)} c/u (orig. RD$${(item.precio * factor).toFixed(2)})`
      : '';
    const itemLine   = `<div class="row"><span>${esc(nom + modMark + balMark)}</span><span>${sub.toFixed(2)}</span></div>`;
    const unitLine   = compacto
      ? `<div class="r small">${esc(detalle)}</div>`
      : `<div class="row small"><span>  ${esc(detalle)}</span></div>`;
    const descLine   = !descTxt ? ''
      : compacto
        ? `<div class="r small">${esc(descTxt)}</div>`
        : `<div class="row small"><span>  ${esc(descTxt)}</span></div>`;
    return `<div style="page-break-inside:avoid;break-inside:avoid">${itemLine}${unitLine}${descLine}</div>`;
  }).join('');

  // El icono se queda: el ticket del navegador es una página rasterizada y lo
  // dibuja perfectamente. En Bluetooth lo quita sanear(), que es donde vive la
  // limitación que estorba, y ahí queda la etiqueta, que es lo que informa.
  const MODO_INFO: Record<string, { icono: string; label: string }> = {
    restaurante: { icono: '🍽️', label: 'Restaurante' },
    taller:      { icono: '🔧', label: 'Taller'      },
    farmacia:    { icono: '💊', label: 'Farmacia'     },
    optica:      { icono: '👓', label: 'Óptica'       },
    clinica:     { icono: '🏥', label: 'Clínica'      },
    gimnasio:    { icono: '🏋️', label: 'Gimnasio'    },
  };
  const modoInfo = sale.modoContexto && sale.modoContexto !== 'general'
    ? MODO_INFO[sale.modoContexto] : null;

  // ── Bloque de totales ──────────────────────────────────────────────────────
  // Los montos base + ITBIS por tasa se toman de calcularDesgloseITBIS() —
  // mismo criterio que el builder del e-CF (MontoGravadoI1/I2, MontoExento,
  // TotalITBIS1/2). No se derivan del subtotal combinado sino de los ítems.
  const { gravado18, gravado16, exento: montoExento, itbis18, itbis16 } =
    calcularDesgloseITBIS(sale.items, esExento);

  const descGlobalBase  = sale.descuentoGlobal ?? 0;
  const descGlobalPact  = sale.descuentoGlobalFinal ?? descGlobalBase;
  const hayDescGlobal   = descGlobalBase > 0;
  const baseImponible   = round2(sale.subtotal - descGlobalBase);

  // La propina se suma DESPUÉS del total de la venta.
  const totalMercancia = round2(sale.total - (sale.propina ?? 0));
  // Cantidad de líneas del carrito (no suma de cantidades — con pesables sería decimal)
  const totalLineas    = sale.items.length;

  const hayExento = montoExento > 0;
  const hayI1     = itbis18 > 0;
  const hayI2     = itbis16 > 0;
  const gravadoTotal = round2(gravado18 + gravado16);

  let totalesHtml: string;
  let desgloseFiscalHtml = '';

  if (hayDescGlobal) {
    // CON descuento global: el recibo habla en pesos c/ITBIS (lo pactado con el
    // cliente). El desglose fiscal va debajo del TOTAL.
    totalesHtml = compacto
      ? row(`Subtotal c/ITBIS ${num(round2(totalMercancia + descGlobalPact))}`, `Desc. -${num(descGlobalPact)}`)
      : [
          row('Subtotal (c/ITBIS):', fmt(round2(totalMercancia + descGlobalPact))),
          row('Descuento:', `-${fmt(descGlobalPact)}`),
        ].join('\n');
    desgloseFiscalHtml = esExento
      ? (compacto
          ? `<div class="row small"><span>Monto exento (ZF)</span><span>${num(baseImponible)}</span></div>`
          : `${line()}<div class="row small"><span>Monto exento (ZF):</span><span>${fmt(baseImponible)}</span></div>`)
      : (compacto
          ? `<div class="row small"><span>Base imponible ${num(baseImponible)}</span><span>ITBIS 18% ${num(sale.iva)}</span></div>`
          : `${line()}<div class="row small"><span>Base imponible:</span><span>${fmt(baseImponible)}</span></div>` +
            `<div class="row small"><span>ITBIS (18%):</span><span>${fmt(sale.iva)}</span></div>`);
  } else if (esExento) {
    // E44 Zona Franca: sin desglose de ITBIS
    totalesHtml = compacto
      ? row(`Subtotal ${num(sale.subtotal)}`, 'Exento (ZF)')
      : row('Subtotal:', fmt(sale.subtotal));
  } else if (compacto) {
    // Compacto: subtotal e ITBIS emparejados en un renglón. Las líneas que no
    // aplican no se imprimen, igual que en normal.
    const izq = gravadoTotal > 0 ? `Subtotal ${num(gravadoTotal)}`
              : hayExento       ? `Subtotal ${num(montoExento)}`
              :                   `Subtotal ${num(sale.subtotal)}`;
    const partesDer: string[] = [];
    if (hayI1) partesDer.push(`ITBIS 18% ${num(itbis18)}`);
    if (hayI2) partesDer.push(`ITBIS 16% ${num(itbis16)}`);
    if (hayI1 && hayI2) partesDer.push(`Total ${num(round2(itbis18 + itbis16))}`);
    const filas = [row(izq, partesDer.shift() ?? 'ITBIS 0.00')];
    // Con dos tasas el renglón no da: el resto baja a la derecha, sin perderse.
    for (const p of partesDer) filas.push(`<div class="r">${esc(p)}</div>`);
    if (gravadoTotal > 0 && hayExento) filas.push(row(`Gravado ${num(gravadoTotal)}`, `Exento ${num(montoExento)}`));
    totalesHtml = filas.join('\n');
  } else {
    // Desglose fiscal completo por tasa (visible solo las líneas que aplican)
    const lineas: string[] = [];
    if (gravadoTotal > 0 && !hayExento) {
      lineas.push(row('Subtotal:', fmt(gravadoTotal)));
    } else if (gravadoTotal > 0 && hayExento) {
      lineas.push(row('Subtotal Gravado:', fmt(gravadoTotal)));
      lineas.push(row('Subtotal Exento:', fmt(montoExento)));
    } else if (hayExento) {
      // Solo exentos (sin tasa gravada)
      lineas.push(row('Subtotal:', fmt(montoExento)));
    }
    if (hayI1) lineas.push(row('ITBIS (18%):', fmt(itbis18)));
    if (hayI2) lineas.push(row('ITBIS (16%):', fmt(itbis16)));
    if (hayI1 && hayI2) lineas.push(row('Total ITBIS:', fmt(round2(itbis18 + itbis16))));
    totalesHtml = lineas.join('\n');
  }

  // ── Pago ───────────────────────────────────────────────────────────────────
  const pagoHtml = (() => {
    if (tipoDoc === 'COTIZACIÓN' || tipoDoc === 'PRO-FORMA') {
      return compacto
        ? row(`Validez ${validezDias ?? 30} días`, `${totalLineas} ít.`)
        : row('Validez:', `${validezDias ?? 30} días`) + '\n' + row('Total Ítems:', String(totalLineas));
    }
    if (tipoDoc === 'PRE-FACTURA') {
      return compacto
        ? row('PENDIENTE DE PAGO', `${totalLineas} ít.`)
        : row('Estado:', 'PENDIENTE DE PAGO') + '\n' + row('Total Ítems:', String(totalLineas));
    }
    const detalleMixto = esMixtoRecibo
      ? formasPagoRecibo.map(fp => compacto
          ? `<div class="r small">${esc(`${TIPO_LABEL_RECIBO[fp.tipo] ?? 'Otro'} ${num(fp.monto)}`)}</div>`
          : row(`  ${TIPO_LABEL_RECIBO[fp.tipo] ?? 'Otro'}:`, fmt(fp.monto)))
      : (sale.metodo !== 'efectivo'
          ? [compacto
              ? `<div class="r small">${esc(`${metodoLabel} ${num(pagoMostrar)}`)}</div>`
              : row(`  ${esc(metodoLabel)}:`, fmt(pagoMostrar))]
          : []);
    const plazo = sale.metodo === 'credito' && sale.diasCredito
      ? (compacto ? `<div class="r small">${esc(`Plazo ${sale.diasCredito} días`)}</div>` : row('Plazo:', `${sale.diasCredito} días`))
      : '';
    if (compacto) {
      // Pagado + cambio + ítems en un solo renglón, como manda la maqueta.
      // El conteo de items va entre parentesis, no detras de un guion: entre dos
      // cifras de dinero un guion se lee como una resta.
      const der = Number(sale.cambio) > 0
        ? `Cambio ${num(Number(sale.cambio))} (${totalLineas} ít.)`
        : `${totalLineas} ít.`;
      return [row(`Pagado ${num(pagoMostrar)}`, der), ...detalleMixto, plazo]
        .filter(Boolean).join('\n');
    }
    return [
      row('PAGADO:', fmt(pagoMostrar)),
      ...detalleMixto,
      plazo,
      Number(sale.cambio) > 0 ? rowBold('CAMBIO:', fmt(Number(sale.cambio))) : '',
      row('Total Ítems:', String(totalLineas)),
    ].filter(Boolean).join('\n');
  })();

  // ── Montaje ────────────────────────────────────────────────────────────────
  // Una sola pasada. Cada campo se decide aquí, en los dos formatos a la vez.
  const B: string[] = [];

  // Logo — 0 significa sin logo. El ajuste es independiente del formato.
  //
  // El alto es un TOPE, no una orden: con `height` fijo el navegador aplasta los
  // logotipos apaisados contra el ancho del papel en vez de escalarlos (medido:
  // un 3:1 sale deformado). Con max-height + max-width la proporción se respeta
  // siempre, a cambio de que un logo muy apaisado no llegue al alto pedido: en
  // 80 mm el ancho útil son 70 mm, así que a partir de 2,8:1 manda el ancho.
  // Por eso la vista previa de Configuración enseña el alto REAL de cada opción
  // con el logo de la empresa: es lo único que no puede mentir.
  //
  // El ancho útil es el 100 %: antes se recortaba al 80 % (55 % en compacto) sin
  // motivo, y eso dejaba las dos opciones de alto dando lo mismo en logotipos
  // apaisados — el ajuste no hacía nada.
  if (sale.empresaLogo && logoAlturaMm > 0) {
    B.push(`<div class="center" style="margin-bottom:${compacto ? 2 : 4}px"><img src="${sale.empresaLogo}" style="max-width:100%;max-height:${logoAlturaMm}mm;width:auto;height:auto;display:block;margin:0 auto" alt=""></div>`);
  }

  // Emisor — RNC del emisor es intocable, va en los dos formatos.
  const nombreEmp = sale.empresaNombreComercial ?? 'NOMBRE EMPRESA';
  if (compacto) {
    B.push(`<div class="center bold">${esc(sale.empresaRnc ? `${nombreEmp} - RNC ${sale.empresaRnc}` : nombreEmp)}</div>`);
    const contacto = [sale.empresaDireccion, sale.empresaTelefono].filter(Boolean).join(' - ');
    if (contacto) B.push(`<div class="center small">${esc(contacto)}</div>`);
  } else {
    B.push(`<div class="center xlarge">${esc(nombreEmp)}</div>`);
    B.push('<div class="center small">República Dominicana</div>');
    if (sale.empresaRnc)       B.push(txt(`RNC Emisor: ${sale.empresaRnc}`));
    if (sale.empresaDireccion) B.push(small(sale.empresaDireccion));
    if (sale.empresaTelefono)  B.push(txt(`Tel: ${sale.empresaTelefono}`));
  }

  // Tipo de comprobante — intocable.
  B.push(compacto ? line() : dbl());
  if (compacto) {
    B.push(`<div class="center bold">${esc(`${ncfL1} ${ncfL2}`)}</div>`);
  } else {
    B.push(`<div class="center bold">${esc(ncfL1)}</div>`);
    B.push(`<div class="center bold">${esc(ncfL2)}</div>`);
  }

  // Fecha, hora, folio, cajero, sucursal, módulo.
  const fechaTicket = sale.fechaEmision ?? ahora.format('DD/MM/YYYY');
  const horaTicket  = sale.horaEmision  ?? ahora.format('HH:mm:ss');
  B.push(line());
  if (compacto) {
    B.push(row(`${fechaTicket} ${horaTicket}`, sale.folio));
    // La sucursal solo cuando hay más de una: en un negocio de local único es
    // una línea que no informa de nada.
    const emisor = [
      sale.cajero ? `Cajero: ${sale.cajero}` : '',
      (sale.sucursalNombre && variasSucursales) ? sale.sucursalNombre : '',
      modoInfo ? `${modoInfo.icono} ${modoInfo.label}` : '',
    ].filter(Boolean).join(' - ');
    if (emisor) B.push(txt(emisor));
  } else {
    B.push(row('Fecha:', fechaTicket));
    B.push(row('Hora:', horaTicket));
    B.push(rowBold(tipoDoc ? `${tipoDoc}:` : 'Factura:', sale.folio));
    if (sale.cajero)         B.push(row('Cajero:', sale.cajero));
    if (sale.sucursalNombre) B.push(row('Sucursal:', sale.sucursalNombre));
    if (modoInfo)            B.push(row('Módulo:', `${modoInfo.icono} ${modoInfo.label}`));
  }

  // Comprador — cuando el cliente declaró RNC.
  if (mostrarComprador) {
    if (compacto) {
      B.push(txt([`RNC ${sale.rncComprador ?? ''}`, sale.razonSocial].filter(Boolean).join(' - ')));
    } else {
      B.push(line());
      B.push('<div class="bold">COMPRADOR:</div>');
      B.push(txt(`RNC: ${sale.rncComprador ?? ''}`));
      if (sale.razonSocial) B.push(txt(sale.razonSocial));
    }
  }

  // MODIFICA A — notas de crédito/débito.
  if (sale.facturaOriginalFolio || sale.ncfOriginal || sale.codigoModificacion || sale.descripcionMotivo) {
    B.push(line());
    if (compacto) {
      B.push('<div class="center bold">-- MODIFICA A --</div>');
      if (sale.facturaOriginalFolio || sale.ncfOriginal) {
        B.push(row(sale.facturaOriginalFolio ? `Fact. ${sale.facturaOriginalFolio}` : '', sale.ncfOriginal ?? ''));
      }
      if (sale.codigoModificacion) B.push(txt(`Cód. modif. ${sale.codigoModificacion}`));
      if (sale.descripcionMotivo)  B.push(small(sale.descripcionMotivo));
    } else {
      B.push('<div class="center bold">-- MODIFICA A --</div>');
      if (sale.facturaOriginalFolio) B.push(row('Factura orig.:', sale.facturaOriginalFolio));
      if (sale.ncfOriginal)          B.push(row('e-NCF orig.:', sale.ncfOriginal));
      if (sale.codigoModificacion)   B.push(row('Cód.Modif.:', sale.codigoModificacion));
      if (sale.descripcionMotivo)    B.push(small(sale.descripcionMotivo));
    }
  }

  // Ítems.
  B.push(line());
  if (!compacto) {
    B.push('<div class="row bold"><span>DESCRIPCIÓN</span><span>IMPORTE</span></div>');
    B.push(line());
  }
  B.push(itemsHtml);
  B.push(line());

  // Totales + propina. El desglose de ITBIS es intocable.
  B.push(totalesHtml);
  if ((sale.propina ?? 0) > 0) {
    B.push(compacto ? row(`Propina ${num(sale.propina!)}`, '') : row('Propina:', fmt(sale.propina!)));
  }

  // TOTAL — el separador grueso se reserva para aquí. Doble altura en los dos
  // formatos: es lo que mira el cliente.
  B.push(dbl());
  B.push(`<div class="row xlarge bold"><span>TOTAL:</span><span>${fmt(sale.total)}</span></div>`);
  if (desgloseFiscalHtml) B.push(desgloseFiscalHtml);

  // Pago.
  B.push(line());
  B.push(pagoHtml);

  // Bloque e-CF — e-NCF, código de seguridad, fecha de firma y QR. Todo intocable.
  if (!tipoDoc) {
    if (sale.encf && mostrarEcf) {
      const firma = sale.ecfFecha ?? ahora.format('DD-MM-YYYY HH:mm:ss');
      B.push(line());
      if (compacto) {
        B.push(row(`e-NCF ${sale.encf}`, sale.securityCode ? `Seg. ${sale.securityCode}` : ''));
        B.push(txt(`Firma DGII ${firma}`));
      } else {
        B.push(row('e-NCF:', sale.encf));
        B.push(row('Fecha firma:', firma));
        if (sale.securityCode) B.push(row('Cód.Seg.:', sale.securityCode));
        B.push('<div class="center" style="font-size:9pt;margin-top:4px;">Generado por HiCloud ERP</div>');
        B.push(line());
      }
      if (qrDataUrl && !sale.ecfPendiente) {
        const ladoMm = QR_LADO_MM[compacto ? 'compacto' : 'normal'];
        if (compacto) {
          // La leyenda va AL LADO del QR, no debajo: el bloque entero baja de
          // ~34mm de alto a los 19mm que mide el propio QR.
          B.push(`<div class="qrrow"><img src="${qrDataUrl}" style="width:${ladoMm}mm;height:${ladoMm}mm" alt="QR DGII"><div class="small">Escanea para verificar en DGII</div></div>`);
        } else {
          B.push(`<div class="center"><img src="${qrDataUrl}" style="width:${ladoMm}mm;height:${ladoMm}mm" alt="QR DGII"></div>`);
          B.push('<div class="center small">Escanea para verificar en DGII</div>');
        }
      } else {
        B.push('<div class="center small">Verifica en: dgii.gov.do</div>');
      }
      if (sale.ecfPendiente) {
        B.push(compacto
          ? '<div class="center bold">&#9888; COMPROBANTE EN PROCESO DE VALIDACIÓN DGII</div>'
          : `${line()}<div class="center box"><div class="bold">&#9888; COMPROBANTE EN PROCESO</div><div>DE VALIDACIÓN DGII</div><div class="small">Será enviado cuando sea procesado.</div></div>`);
      }
    } else {
      B.push(compacto
        ? '<div class="center bold">&#9888; COMPROBANTE EN PROCESO DE VALIDACIÓN DGII</div>'
        : '<div class="center box"><div class="bold">&#9888; COMPROBANTE EN PROCESO</div><div>DE VALIDACIÓN DGII</div></div>');
    }
  }

  // Nota de precio modificado.
  if (tieneModificados) {
    B.push(compacto ? small('* Precio modificado en venta') : `${line()}<div class="small">* Precio modificado en venta</div>`);
  }

  // Mensaje configurable del ticket.
  if (mensajeTicket?.trim()) {
    B.push(compacto
      ? `<div class="center small" style="white-space:pre-wrap;word-break:break-word;">${esc(mensajeTicket.trim())}</div>`
      : `${line()}<div style="text-align:center;white-space:pre-wrap;word-break:break-word;">${esc(mensajeTicket.trim())}</div>`);
  }

  // Pie — política de devoluciones, agradecimiento y firma del sistema.
  // En compacto los tres van en una línea; en normal cada uno en su bloque.
  const cierre = tipoDoc === 'PRE-FACTURA'
    ? ['** DOCUMENTO NO FISCAL **', 'Presente este ticket para pagar']
    : tipoDoc === 'COTIZACIÓN'
    ? ['** COTIZACION - NO ES FACTURA **']
    : tipoDoc === 'PRO-FORMA'
    ? ['** PRO FORMA - NO ES FACTURA **', 'No válida como comprobante fiscal']
    : ['Gracias por su compra'];
  const firmaSistema = (tipoDoc || !sale.encf || !mostrarEcf || compacto) ? 'HiCloud ERP' : '';
  if (compacto) {
    B.push(line());
    B.push(`<div class="center small">${esc([politicaDev?.trim(), ...cierre, firmaSistema].filter(Boolean).join(' - '))}</div>`);
  } else {
    if (politicaDev?.trim()) {
      B.push(`${line()}<div class="small"><strong>POLÍTICA DE DEVOLUCIONES:</strong><br/>${esc(politicaDev.trim())}</div>`);
    }
    B.push(dbl());
    B.push(line());
    B.push(`<div class="center${tipoDoc ? ' bold' : ''}">${esc(cierre[0])}</div>`);
    for (const extra of cierre.slice(1)) B.push(`<div class="center small">${esc(extra)}</div>`);
    if (firmaSistema) B.push(`<div class="center" style="font-size:9pt;margin-top:4px;">Generado por ${esc(firmaSistema)}</div>`);
  }

  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=302,initial-scale=1,shrink-to-fit=no">
<title>Recibo ${esc(sale.folio)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;overflow-wrap:break-word}
html{margin:0;padding:0;width:${prn.width}}
body{font-family:'Courier New',Courier,monospace;font-size:${prn.fontSize};font-weight:bold;line-height:1.45;
  width:${prn.width};margin:0;padding:3mm ${prn.paddingLR};
  color:#000;background:#fff;
  -webkit-font-smoothing:none;font-smooth:never}
.center{text-align:center}
.r{text-align:right}
.bold{font-weight:bold}
.large{font-size:13pt;font-weight:bold}
.xlarge{font-size:15pt;font-weight:bold}
.small{font-size:9pt}
.row{display:flex;justify-content:space-between;gap:4px;margin:1px 0;width:100%}
.row span:first-child{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.row span:last-child{text-align:right;white-space:nowrap}
.line{border-top:1px dashed #000;margin:4px 0}
.dbl{border-top:2px solid #000;margin:4px 0}
.box{border:1px dashed #000;padding:3px 2px;margin:3px 0}
img{display:block;margin:4px auto}
/* QR con la leyenda al lado — el bloque mide lo que mide el QR, no el doble. */
.qrrow{display:flex;align-items:center;gap:3mm;margin:3px 0}
.qrrow img{margin:0;flex:0 0 auto}
/* Nearest-neighbour: un QR reescalado con suavizado se emborrona en el borde
   de cada módulo, que es justo donde el lector se apoya. */
img[alt="QR DGII"]{image-rendering:pixelated;image-rendering:crisp-edges}
/* Compacto: mismos cuerpos de letra, menos aire. El separador grueso conserva
   su margen porque es el que anuncia el TOTAL. */
body.compacto{line-height:1.22;padding-top:2mm}
body.compacto .line{margin:2px 0}
body.compacto .row{margin:0}
@page{size:${prn.width} auto;margin:0}
@media print{html,body{width:${prn.width}}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
${soloVista ? '' : `<script>
window.addEventListener('load',function(){setTimeout(function(){window.print()},350)});
window.addEventListener('afterprint',function(){setTimeout(function(){
  try{window.close()}catch(e){}
  setTimeout(function(){if(!window.closed){document.body.innerHTML='<div style="text-align:center;padding:40px;font-family:sans-serif"><h2 style="color:#059669">&#10003; Impresión lista</h2><p style="margin-top:8px;color:#666">Puede cerrar esta ventana</p></div>'}},600)
},300)});
</script>`}
</head><body class="${compacto ? 'compacto' : ''}">

${B.filter(Boolean).join('\n')}

</body></html>`;
}

// ── Datos de ejemplo para la vista previa de Configuración ───────────────────

/** Logo de muestra — un rectángulo con el nombre, para que se vea el efecto de
 *  la altura del logo sin depender de que la empresa tenga uno subido. */
const LOGO_EJEMPLO =
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60">' +
    '<rect width="240" height="60" fill="#fff" stroke="#000" stroke-width="3"/>' +
    '<text x="120" y="39" font-family="monospace" font-size="26" font-weight="bold" ' +
    'text-anchor="middle" fill="#000">FERRETERIA</text></svg>');

/**
 * Venta de ejemplo para la vista previa.
 *
 * Es el caso simple a propósito — una línea, efectivo, con cambio — porque es lo
 * que se imprime el 90 % de las veces y es sobre lo que se decide si el papel
 * ahorrado compensa. Los bloques condicionales (comprador con RNC, pago mixto,
 * propina, nota de crédito) no aparecen aquí, pero siguen imprimiéndose en los
 * dos formatos cuando aplican.
 */
/** @param logoEmpresa el logo REAL de la empresa. Importa pasarlo: el alto que
 *  alcanza el logo depende de su proporción, y con el de muestra la vista previa
 *  daría un número que no es el que va a salir por la impresora. */
export function ventaEjemploTicket(logoEmpresa?: string | null): TicketSale {
  return {
    folio:        'FAC-825',
    total:        3600,
    cambio:       400,
    pagoRecibido: 4000,
    metodo:       'efectivo',
    iva:          549.15,
    subtotal:     3050.85,
    items: [{
      produto:        { nombre: 'GRAVA', porcentajeIva: 18 },
      cantidad:       3,
      precio:         1016.95,
      descuentoMonto: 0,
    }],
    tipoNcf:       'E32',
    encf:          'E320000000719',
    securityCode:  'fkv1cT',
    ecfFecha:      '25-08-2026 11:19:39',
    fechaEmision:  '25/08/2026',
    horaEmision:   '11:19:38',
    cajero:        'Yaribel',
    empresaNombreComercial: 'FERRETERIA PAVEL, SRL.',
    empresaRnc:       '132716507',
    empresaDireccion: 'C/ Francisco Caamaño 14, Progreso',
    empresaTelefono:  '829-562-4199',
    empresaLogo:      logoEmpresa || LOGO_EJEMPLO,
  };
}
