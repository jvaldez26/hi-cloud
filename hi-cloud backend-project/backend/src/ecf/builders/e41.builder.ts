/**
 * E41 — Comprobante de Compras Electrónico
 * Propósito: emitido por el comprador para sustentar adquisición a personas
 * no registradas ante la DGII (proveedores informales).
 * IndicadorMontoGravado: 0 — el vendedor informal no transparenta ITBIS.
 * Totales calculados DESDE los items (no buildTotalesGravados con detalles raw).
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha, addDias,
  buildCompradorRNC,
  EcfRncRequeridoError,
} from './base-ecf.builder';

function f2(v: number): number { return parseFloat(v.toFixed(2)); }

export function buildE41(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const proveedor = factura.cliente as any;
  const rnc       = proveedor?.rncReceptor ?? proveedor?.rfc;
  if (!rnc) throw new EcfRncRequeridoError(41, Number(factura.total));

  const fecha      = fmtFecha(factura.fecha ?? new Date());
  const emisor     = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles    = factura.detalles as any[] ?? [];
  const fechaLimite = addDias(factura.fecha ?? new Date(), 30);

  // Retenciones globales de la compra (opcionales)
  const compraData      = (factura as any);
  const retieneItbis    = compraData?.retieneItbis === true;
  const retieneIsr      = compraData?.retieneIsr === true;
  const pctItbis        = f2(Number(compraData?.porcentajeRetencionItbis ?? 30));
  const pctIsr          = f2(Number(compraData?.porcentajeRetencionIsr ?? 10));

  // PASO 1: construir items
  const items = detalles.map((d: any, idx: number) => {
    const pct      = parseFloat(String(d.porcentajeIva ?? 18));
    const indFact  = pct >= 18 ? 1 : pct >= 16 ? 2 : 4;
    const subtotal = f2(Number(d.subtotal));
    const iva      = f2(Number(d.importeIva ?? d.iva ?? 0));

    // Retención ITBIS por item (proporcional)
    const retenItbisItem = retieneItbis && iva > 0 ? f2(iva * pctItbis / 100) : 0;
    // Retención ISR por item (sobre el subtotal)
    const retenIsrItem   = retieneIsr ? f2(subtotal * pctIsr / 100) : 0;

    const item: Record<string, unknown> = {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indFact,
      NombreItem:             d.descripcion,
      IndicadorBienoServicio: 1,
      CantidadItem:           Number(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     f2(Number(d.precioUnitario)),
      MontoItem:              subtotal,
    };

    if (retenItbisItem > 0 || retenIsrItem > 0) {
      item['Retencion'] = {
        IndicadorAgenteRetencionoPercepcion: 1,
        ...(retenItbisItem > 0 ? { MontoITBISRetenido: retenItbisItem } : {}),
        ...(retenIsrItem   > 0 ? { MontoISRRetenido:   retenIsrItem   } : {}),
      };
    }

    return item;
  });

  // PASO 2: calcular totales DESDE los items
  let montoGravado18 = 0, montoGravado16 = 0, montoExento = 0;
  let itbis18 = 0, itbis16 = 0;

  detalles.forEach((d: any) => {
    const pct = parseFloat(String(d.porcentajeIva ?? 18));
    const sub = f2(Number(d.subtotal));
    const iva = f2(Number(d.importeIva ?? d.iva ?? 0));
    if (pct >= 18)      { montoGravado18 += sub; itbis18 += iva; }
    else if (pct >= 16) { montoGravado16 += sub; itbis16 += iva; }
    else                { montoExento += sub; }
  });

  const montoGravadoTotal = f2(montoGravado18 + montoGravado16);
  const totalITBIS        = f2(itbis18 + itbis16);
  const montoTotal        = f2(montoGravadoTotal + montoExento + totalITBIS);

  const totales: Record<string, unknown> = {};
  if (montoGravadoTotal > 0) {
    totales['MontoGravadoTotal'] = montoGravadoTotal;
    totales['MontoGravadoI1']    = f2(montoGravado18);
    totales['ITBIS1']            = 18;
    totales['TotalITBIS']        = totalITBIS;
    totales['TotalITBIS1']       = f2(itbis18);
  }
  if (montoGravado16 > 0) {
    totales['MontoGravadoI2'] = f2(montoGravado16);
    totales['ITBIS2']         = 16;
    totales['TotalITBIS2']    = f2(itbis16);
  }
  if (montoExento > 0) totales['MontoExento'] = montoExento;  // solo si hay items exentos
  totales['MontoTotal'] = montoTotal;

  // Totales de retenciones (sum desde items para cuadratura DGII)
  if (retieneItbis) {
    const totalItbisRet = f2(items.reduce((s, it: any) => s + Number((it['Retencion'] as any)?.MontoITBISRetenido ?? 0), 0));
    if (totalItbisRet > 0) totales['TotalITBISRetenido'] = totalItbisRet;
  }
  if (retieneIsr) {
    const totalIsrRet = f2(items.reduce((s, it: any) => s + Number((it['Retencion'] as any)?.MontoISRRetenido ?? 0), 0));
    if (totalIsrRet > 0) totales['TotalISRRetencion'] = totalIsrRet;
  }

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                  41,
          encf,
          fechaVencSec,
          indicadorMontoGravado: 0,
          tipoIngresos:          '01',
          tipoPago:              2,
          fechaLimitePago:       fechaLimite,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, proveedor?.nombre ?? 'Proveedor',
          proveedor?.direccion ? { DireccionComprador: proveedor.direccion } : undefined,
        ),
        Totales: totales,
      },
      DetallesItems: { Item: items },
    },
  };
}
