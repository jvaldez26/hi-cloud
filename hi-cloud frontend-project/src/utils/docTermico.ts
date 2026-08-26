import JsBarcode from 'jsbarcode';

/**
 * Documento térmico genérico — CONDUCE, recibo de cobro, anticipo, notas de
 * crédito/débito, comprobante de gasto.
 *
 * Esto vivía dentro de POSPage.tsx, así que solo el POS podía imprimir así. El
 * módulo Conduce → Reporte de Entrega tenía su propio camino (pedía un PDF al
 * backend, generado con puppeteer) y el resultado no se parecía en nada al
 * ticket del POS: distinta maquetación, distinto encabezado, distinto pie.
 *
 * Al vivir aquí, ambos sitios llaman a la MISMA función y los tickets no pueden
 * divergir: no son "parecidos", son el mismo HTML. Si algún día cambia el
 * formato, cambia en los dos a la vez.
 *
 * Es solo un módulo movido, sin cambios de comportamiento: el HTML que genera
 * es byte a byte el que ya imprimía el POS.
 */

/** Anchos y tipografía por tipo de impresora configurado en la empresa. */
export const IMPRESORA_CONFIG: Record<string, { width: string; fontSize: string; paddingLR: string }> = {
  '58mm':   { width: '58mm',  fontSize: '10pt', paddingLR: '3mm' },
  '80mm':   { width: '80mm',  fontSize: '11pt', paddingLR: '5mm' },
  'carta':  { width: '210mm', fontSize: '12pt', paddingLR: '15mm' },
  'ninguna':{ width: '80mm',  fontSize: '11pt', paddingLR: '5mm' },
};

/** Escapa HTML y elimina el carácter de reemplazo que algunas impresoras inyectan. */
export function esc(s: string): string {
  return s
    .replace(/�/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface GenericDocData {
  tipo:        string;          // "COTIZACIÓN", "PRE-FACTURA", "CONDUCE", etc.
  numero:      string;
  fecha:       string;
  empresa?:    { nombre?: string; rnc?: string; direccion?: string; telefono?: string };
  cliente?:    string;
  rncCliente?: string;
  items:       Array<{ desc: string; cant?: number; precio?: number; total?: number }>;
  subtotal?:   number;
  itbis?:      number;
  total?:      number;
  nota1?:      string;         // línea extra (ej: "Ref. Factura: FAC-XXX")
  nota2?:      string;
  notas?:      string;
  /**
   * Bloques etiqueta/valor con su propio sitio. Van en DOS líneas, no en una
   * fila izquierda/derecha: en 32 caracteres, un valor largo como el nombre de
   * un chofer se come la etiqueta y sale "C…Miguel Angel Fernandez".
   */
  infoRows?:   Array<[string, string]>;
  /** Valor Code128 tal cual — sin prefijos ni ceros añadidos, para que escanee. */
  barcode?:    string;
  /** Bloque de firma del receptor: firma, nombre, cédula y fecha/hora. */
  firmaRecepcion?: boolean;
}

/** Raya para rellenar a mano, del ancho que quede tras la etiqueta. */
function _lineaFirma(label: string, ancho = 30): string {
  return `${label} ${'_'.repeat(Math.max(6, ancho - label.length - 1))}`;
}

/**
 * Bloque de recepción — se firma en la puerta de un negocio, de pie, así que
 * lleva aire de sobra entre renglones (las clases gap se traducen a saltos
 * reales tanto en el navegador como en ESC/POS).
 */
function _firmaHTML(): string {
  return [
    '<div class="line"></div>',
    '<div class="center bold">RECIBIDO CONFORME</div>',
    '<div class="gap"></div>',
    `<div>${_lineaFirma('Firma:')}</div>`,
    '<div class="gap2"></div>',
    `<div>${_lineaFirma('Nombre:')}</div>`,
    '<div class="small">(en letra de molde)</div>',
    '<div class="gap"></div>',
    `<div>${_lineaFirma('Cedula:')}</div>`,
    '<div class="gap"></div>',
    `<div>${_lineaFirma('Fecha/Hora:')}</div>`,
    '<div class="gap"></div>',
  ].join('');
}

/**
 * Code128 como imagen; el número va aparte, como texto, que se lee mejor en
 * térmica que el que dibuja la propia librería.
 *
 * El data-barcode no es decorativo: la ruta Bluetooth descarta las <img> y lo
 * usa para rasterizar el código como GS v 0. Sin ese atributo, el barcode se
 * perdería en silencio en las impresoras BT.
 */
function _barcodeHTML(valor: string): string {
  const src = _barcodeDataURI(valor);
  return [
    '<div class="line"></div>',
    `<div class="center"><img class="barcode" data-barcode="${esc(valor)}"${src ? ` src="${src}"` : ''} alt="${esc(valor)}"></div>`,
    `<div class="center bold">${esc(valor)}</div>`,
  ].join('');
}

/**
 * Code128 a data URI, para que el HTML del ticket sea autónomo: se escribe en
 * una ventana nueva con document.write y ahí no hay React que lo pinte después.
 *
 * El valor va tal cual, sin prefijos ni ceros: escanearlo tiene que dar lo
 * mismo que teclearlo en el buscador del reporte de entrega.
 */
function _barcodeDataURI(valor: string): string {
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, valor, {
      format:       'CODE128',
      width:        2,
      height:       55,
      displayValue: false,
      margin:       0,
      background:   '#ffffff',
      lineColor:    '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[BARCODE] No se pudo generar el código de barras:', err);
    return '';
  }
}

/** Recibo térmico genérico (conduce, cobro, anticipo, notas crédito/débito). */
export function buildDocTermicoHTML(
  gd: GenericDocData,
  cfg: { tipoImpresora?: string } = {},
): string {
  const { tipoImpresora = '80mm' } = cfg;
  const prn  = IMPRESORA_CONFIG[tipoImpresora] ?? IMPRESORA_CONFIG['80mm'];
  const fmt  = (n: number) => `RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const row  = (l: string, v: string) => `<div class="row"><span>${esc(l)}</span><span>${esc(v)}</span></div>`;
  const line = () => '<div class="line"></div>';
  const dbl  = () => '<div class="dbl"></div>';
  const e    = gd.empresa ?? {};
  const tipo = gd.tipo;

  const hasTotals = gd.items.some(i => i.total !== undefined);
  const hasCant   = gd.items.some(i => i.cant  !== undefined);

  const itemsHtml = gd.items.map(item => {
    const nom = (item.desc ?? '').length > 26 ? (item.desc ?? '').slice(0, 25) + '…' : (item.desc ?? '');
    if (hasTotals) {
      const qtyStr   = item.cant !== undefined && item.cant > 0 ? ` ×${item.cant}` : '';
      const totalStr = item.total !== undefined ? item.total.toFixed(2) : '';
      return `<div class="row"><span>${esc(nom + qtyStr)}</span><span>${totalStr}</span></div>`;
    }
    const qtyStr = item.cant !== undefined ? ` — ${item.cant}` : '';
    return `<div>${esc(nom + qtyStr)}</div>`;
  }).join('');

  const footerHtml =
      tipo.includes('CONDUCE')  ? '<div class="center bold">** DOCUMENTO DE DESPACHO **</div>'
    : tipo.includes('ANTICIPO') ? '<div class="center bold">** RECIBO DE ANTICIPO **</div><div class="center small">Documento interno de pago</div>'
    : tipo.includes('COBRO')    ? '<div class="center bold">** RECIBO DE COBRO **</div><div class="center small">Documento interno de pago</div>'
    : tipo.includes('CRÉDITO')  ? '<div class="center bold">** NOTA DE CRÉDITO **</div>'
    : tipo.includes('DÉBITO')   ? '<div class="center bold">** NOTA DE DÉBITO **</div>'
    : tipo.includes('GASTO')    ? '<div class="center bold">** COMPROBANTE DE GASTO **</div>'
    :                             '<div class="center small">Documento no fiscal</div>';

  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=302,initial-scale=1,shrink-to-fit=no">
<title>${esc(tipo)} ${esc(gd.numero)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;overflow-wrap:break-word}
html{margin:0;padding:0;width:${prn.width}}
body{font-family:'Courier New',Courier,monospace;font-size:${prn.fontSize};font-weight:bold;line-height:1.45;
  width:${prn.width};margin:0;padding:3mm ${prn.paddingLR};
  color:#000;background:#fff;-webkit-font-smoothing:none;font-smooth:never}
.center{text-align:center}
.bold{font-weight:bold}
.xlarge{font-size:15pt;font-weight:bold}
.small{font-size:9pt}
.row{display:flex;justify-content:space-between;gap:4px;margin:1px 0;width:100%}
.row span:first-child{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.row span:last-child{text-align:right;white-space:nowrap}
.line{border-top:1px dashed #000;margin:4px 0}
.dbl{border-top:2px solid #000;margin:4px 0}
.gap{height:5mm}
.gap2{height:9mm}
.barcode{display:block;margin:2mm auto 1mm;max-width:100%;height:auto;image-rendering:pixelated}
@page{size:${prn.width} auto;margin:0}
@media print{html,body{width:${prn.width}}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>

${[
  e.nombre    ? `<div class="center xlarge">${esc(e.nombre)}</div>`    : '',
  `<div class="center small">República Dominicana</div>`,
  e.rnc       ? `<div>RNC Emisor: ${esc(e.rnc)}</div>`                : '',
  e.direccion ? `<div class="small">${esc(e.direccion)}</div>`         : '',
  e.telefono  ? `<div>Tel: ${esc(e.telefono)}</div>`                   : '',
].filter(Boolean).join('')}
${dbl()}
<div class="center bold">${esc(tipo)}</div>
${line()}
${row('Número:', gd.numero)}${row('Fecha:', gd.fecha)}${[
  gd.cliente    ? row('Cliente:', gd.cliente)                 : '',
  gd.rncCliente ? row('RNC:',     gd.rncCliente)              : '',
  gd.nota1      ? `<div class="small">${esc(gd.nota1)}</div>` : '',
].filter(Boolean).join('')}
${(gd.infoRows ?? []).map(([l, v]) =>
  `<div class="small">${esc(l)}</div><div class="bold">${esc(v)}</div>`).join('')}
${line()}
<div class="row bold"><span>DESCRIPCIÓN</span>${hasTotals ? '<span>TOTAL</span>' : hasCant ? '<span>CANT</span>' : ''}</div>
${line()}
${itemsHtml}
${dbl()}
${[
  gd.subtotal !== undefined                    ? row('Subtotal:',    fmt(gd.subtotal)) : '',
  gd.itbis    !== undefined && gd.itbis > 0    ? row('ITBIS (18%):', fmt(gd.itbis))   : '',
  gd.total    !== undefined ? `<div class="row xlarge bold"><span>TOTAL:</span><span>${fmt(gd.total)}</span></div>` : '',
].filter(Boolean).join('')}
${line()}
${[
  gd.nota2 ? `<div class="small">${esc(gd.nota2)}</div>${line()}` : '',
  gd.notas ? `<div class="small">Nota: ${esc(gd.notas)}</div>${line()}` : '',
].filter(Boolean).join('')}
${gd.firmaRecepcion ? _firmaHTML() : ''}
${gd.barcode ? _barcodeHTML(gd.barcode) : ''}
${footerHtml}

</body></html>`;
}

/**
 * Construye el GenericDocData de un CONDUCE a partir de la respuesta de
 * GET /conduces/:id y de GET /configuracion/empresa.
 *
 * Vive aquí, y no en cada pantalla, por el mismo motivo que la plantilla: si el
 * POS y el Reporte de Entrega armaran este objeto por su cuenta, bastaría con
 * que uno añadiera un campo para que los tickets volvieran a divergir.
 */
export function buildConduceDocData(docRes: any, empRes: any): GenericDocData {
  const factFolio: string | undefined = docRes.facturaFolio ?? docRes.factura?.folio;
  return {
    tipo:    'CONDUCE',
    numero:  docRes.numero ?? String(docRes.id ?? ''),
    fecha:   String(docRes.fecha ?? '').substring(0, 10),
    empresa: {
      nombre:    empRes?.razonSocial ?? empRes?.nombre,
      rnc:       empRes?.rnc,
      direccion: empRes?.direccion,
      telefono:  empRes?.telefono,
    },
    cliente: docRes.cliente?.nombre,
    // El chofer va arriba, con su etiqueta. Si el conduce es de los viejos y no
    // lo tiene, sale la raya para escribirlo a mano — nunca 'undefined'.
    infoRows: [
      ['CHOFER',   String(docRes.conductor ?? '').trim() || '_______________________'],
      ...(String(docRes.vehiculo ?? '').trim()
        ? [['VEHICULO', String(docRes.vehiculo).trim()] as [string, string]]
        : []),
    ] as Array<[string, string]>,
    barcode:        docRes.numero ?? undefined,
    firmaRecepcion: true,
    items:   (docRes.detalles ?? []).map((d: any) => ({ desc: d.descripcion, cant: Number(d.cantidad) })),
    nota1:   factFolio ? `Ref. Factura: ${factFolio}` : undefined,
    nota2:   docRes.direccionEntrega
      ? `Entrega: ${docRes.direccionEntrega}${docRes.contactoEntrega ? ` · ${docRes.contactoEntrega}` : ''}`
      : docRes.contactoEntrega ? `Contacto: ${docRes.contactoEntrega}` : undefined,
    notas:   docRes.notas,
  };
}
