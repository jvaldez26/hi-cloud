/**
 * E31 — Factura de Crédito Fiscal Electrónica
 * Comprador: RNC obligatorio.
 * Montos principales en RD$; OtraMoneda/OtraMonedaDetalle si moneda extranjera.
 * Totales calculados DESDE los items (no desde factura.subtotal/iva).
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha,
  buildCompradorRNC,
  EcfRncRequeridoError,
  resolverMoneda,
} from './base-ecf.builder';

function f2(v: number): number { return parseFloat(v.toFixed(2)); }

export function buildE31(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc;
  if (!rnc) throw new EcfRncRequeridoError(31, Number(factura.total));

  const fecha  = fmtFecha(factura.fecha ?? new Date());
  const emisor = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const mc         = resolverMoneda(factura);
  const detallesME = factura.detalles as any[] ?? [];

  // ── PASO 1: construir items con DOP como principal ─────────────────────────
  const items = detallesME.map((d: any, idx: number) => {
    const precioME = Number(d.precioUnitario);
    const montoME  = Number(d.subtotal);
    const pct      = parseFloat(String(d.porcentajeIva ?? 18));
    const indFact  = pct >= 18 ? 1 : pct >= 16 ? 2 : 4;
    const otME     = mc.otraMonedaItem(precioME, montoME);
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indFact,
      NombreItem:             d.descripcion,
      IndicadorBienoServicio: 1,
      CantidadItem:           Number(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     f2(mc.toDOP(precioME)),
      ...(otME ? { OtraMonedaDetalle: otME } : {}),
      MontoItem:              f2(mc.toDOP(montoME)),
    };
  });

  // ── PASO 2: calcular totales DESDE los items (en RD$) ─────────────────────
  let montoGravado18 = 0, montoGravado16 = 0, montoExento = 0;
  let itbis18 = 0, itbis16 = 0;

  detallesME.forEach((d: any) => {
    const pct    = parseFloat(String(d.porcentajeIva ?? 18));
    const sub    = f2(mc.toDOP(Number(d.subtotal)));
    const ivaRaw = Number(d.importeIva ?? d.iva ?? 0);
    const iva    = f2(mc.toDOP(ivaRaw));
    if (pct >= 18) { montoGravado18 += sub; itbis18 += iva; }
    else if (pct >= 16) { montoGravado16 += sub; itbis16 += iva; }
    else { montoExento += sub; }
  });

  const montoGravadoTotal = f2(montoGravado18 + montoGravado16);
  const totalITBIS        = f2(itbis18 + itbis16);
  const montoTotal        = f2(montoGravadoTotal + montoExento + totalITBIS);

  // Totales E31 — MontoExento solo si hay items exentos (prohibido si es 0)
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
  // MontoExento SOLO si hay items exentos (E31 no debe tenerlos normalmente)
  if (montoExento > 0) totales['MontoExento'] = montoExento;
  totales['MontoTotal'] = montoTotal;

  // ── PASO 3: OtraMoneda como sección HERMANA de Totales en Encabezado ─────────
  const totalME    = Number(factura.total);
  const subtotalME = Number((factura as any).subtotal ?? factura.total);
  const itbisME    = Number((factura as any).iva ?? 0);
  const otMEEncab  = mc.otraMonedaGravados(subtotalME, itbisME, totalME);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                   31,
          encf,
          fechaVencSec,
          indicadorEnvioDiferido: 1,
          indicadorMontoGravado:  0,
          tipoIngresos:           '01',
          tipoPago:               1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales:   totales,
        // OtraMoneda va DESPUÉS de Totales, al mismo nivel (hermana, no hija)
        ...(otMEEncab ? { OtraMoneda: otMEEncab } : {}),
      } as any,
      DetallesItems: { Item: items },
    },
  };
}
