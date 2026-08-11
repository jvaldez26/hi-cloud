/**
 * E33 — Nota de Débito Electrónica
 * InformacionReferencia: NCFModificado → FechaNCFModificado → CodigoModificacion
 * FechaVencimientoSecuencia: obligatoria.
 * CodigoModificacion: siempre '3' para E33.
 * Si moneda extranjera: montos principales en RD$, OtraMoneda/OtraMonedaDetalle.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, fmtFecha, addDias,
  buildCompradorRNC,
  razonSocialFiscal,
  buildItemsE33,
  resolverMoneda,
  round2,
} from './base-ecf.builder';
import { Logger } from '@nestjs/common';
import { warnCuadraturaDGII, truncarNombreItem } from './sections/items.section';

const logger = new Logger('E33Builder');

function cap4(n: number | string): number { return parseFloat(Number(n).toFixed(4)); }

// E33 siempre usa CodigoModificacion='3' según normativa DGII
// NCFModificado acepta series E, A, B y P

export function buildE33(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, infoReferencia } = input;

  if (!infoReferencia?.NCFModificado) {
    throw new Error('E33 requiere infoReferencia.NCFModificado (eNCF de la factura original)');
  }
  const ncfModificado = infoReferencia.NCFModificado;
  if (!/^[EABP]\d+/.test(ncfModificado)) {
    throw new Error(`NCFModificado "${ncfModificado}" inválido para E33. Debe comenzar con E, A, B o P.`);
  }

  const codigoMod = '3';  // siempre 3 para E33
  const mc         = resolverMoneda(factura);
  const detallesME = factura.detalles as any[] ?? [];
  const fecha      = fmtFecha(factura.fecha ?? new Date());
  const emisor     = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc ?? '00000000000';

  // ── ITEMS: DOP como principal, OtraMonedaDetalle si USD ──────────────────
  const items = detallesME.map((d: any, idx: number) => {
    warnCuadraturaDGII(d, encf);
    const precioME = Number(d.precioUnitario);
    const montoME  = Number(d.subtotal);
    const pct      = parseFloat(String(d.porcentajeIva ?? 18));
    const indFact  = pct >= 18 ? 1 : pct >= 16 ? 2 : 4;
    const otME     = mc.otraMonedaItem(precioME, montoME);

    // E33 usa buildItemsE33 structure (cantidades como string) solo para DOP base
    // Con moneda extranjera aplicamos la misma estructura
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indFact,
      NombreItem:             truncarNombreItem(d.descripcion, encf),
      IndicadorBienoServicio: 1,
      CantidadItem:           String(cap4(d.cantidad)),
      UnidadMedida:           '47',
      PrecioUnitarioItem:     round2(mc.toDOP(precioME)).toFixed(2),
      ...(otME ? { OtraMonedaDetalle: otME } : {}),
      MontoItem:              round2(mc.toDOP(montoME)).toFixed(2),
    };
  });

  // ── TOTALES: calcular desde items en DOP ──────────────────────────────────
  let montoGravado18 = 0, montoGravado16 = 0, montoExento = 0;
  let itbis18 = 0, itbis16 = 0;
  detallesME.forEach((d: any) => {
    const pct = parseFloat(String(d.porcentajeIva ?? 18));
    const sub = round2(mc.toDOP(Number(d.subtotal)));
    const iva = round2(mc.toDOP(Number(d.importeIva ?? d.iva ?? 0)));
    if (pct >= 18)      { montoGravado18 += sub; itbis18 += iva; }
    else if (pct >= 16) { montoGravado16 += sub; itbis16 += iva; }
    else                { montoExento += sub; }
  });
  const montoGravadoTotal = round2(montoGravado18 + montoGravado16);
  const totalITBIS = round2(itbis18 + itbis16);
  const total      = round2(montoGravadoTotal + montoExento + totalITBIS);

  // Orden estricto XSD DGII: MontoGravadoXX → MontoExento → ITBISXX → TotalITBISXX → MontoTotal
  const totales: Record<string, unknown> = {};
  if (montoGravadoTotal > 0) {
    totales['MontoGravadoTotal'] = montoGravadoTotal;
    totales['MontoGravadoI1']    = round2(montoGravado18);
  }
  if (montoGravado16 > 0) totales['MontoGravadoI2'] = round2(montoGravado16);
  if (montoExento    > 0) totales['MontoExento']     = round2(montoExento);
  if (montoGravadoTotal > 0) {
    totales['ITBIS1']      = 18;
    totales['TotalITBIS']  = totalITBIS;
    totales['TotalITBIS1'] = round2(itbis18);
  }
  if (montoGravado16 > 0) { totales['ITBIS2'] = 16; totales['TotalITBIS2'] = round2(itbis16); }
  totales['MontoTotal'] = total;
  // TablaFormasPago obligatoria en E33
  totales['TablaFormasPago'] = { FormaDePago: [{ FormaPago: 1, MontoPago: total.toFixed(2) }] };

  // ── OTRAMONEDA: hermana de Totales, calculada desde items USD ─────────────
  let otraMoneda: Record<string, unknown> | undefined;
  if (mc.esME) {
    let montoGrav1ME = 0, itbis1ME = 0, montoExentoME = 0;
    detallesME.forEach((d: any) => {
      const pct = parseFloat(String(d.porcentajeIva ?? 18));
      const sub = round2(Number(d.subtotal));
      const iva = round2(Number(d.importeIva ?? d.iva ?? 0));
      if (pct >= 18) { montoGrav1ME += sub; itbis1ME += iva; }
      else           { montoExentoME += sub; }
    });
    const montoTotalME = round2(montoGrav1ME + montoExentoME + itbis1ME);
    otraMoneda = {
      TipoMoneda:                  mc.moneda,
      TipoCambio:                  mc.tasa.toFixed(4),
      MontoGravadoTotalOtraMoneda: round2(montoGrav1ME).toFixed(2),
      MontoGravado1OtraMoneda:     round2(montoGrav1ME).toFixed(2),
      ...(montoExentoME > 0 ? { MontoExentoOtraMoneda: round2(montoExentoME).toFixed(2) } : {}),
      TotalITBISOtraMoneda:        round2(itbis1ME).toFixed(2),
      TotalITBIS1OtraMoneda:       round2(itbis1ME).toFixed(2),
      MontoTotalOtraMoneda:        montoTotalME.toFixed(2),
    };
  }

  logger.debug(`[E33] moneda=${(factura as any).moneda ?? 'DOP'} otraMoneda=${!!otraMoneda}`);

  // ── TipoPago: derivado de factura.tipoPago (CONTADO=1, CREDITO=2) ─────────
  const tipoPagoECF        = factura.tipoPago === 'CREDITO' ? 2 : 1;
  const fechaLimitePagoECF = tipoPagoECF === 2
    ? (factura.fechaVencimiento
        ? fmtFecha(factura.fechaVencimiento)
        : addDias(factura.fecha ?? new Date(), factura.diasCredito || 30))
    : undefined;

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                  33,
          encf,
          fechaVencSec,
          indicadorMontoGravado: 0,
          tipoIngresos:          '01',
          tipoPago:              tipoPagoECF,
          fechaLimitePago:       fechaLimitePagoECF,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, razonSocialFiscal(cliente),
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales:   totales,
        ...(otraMoneda ? { OtraMoneda: otraMoneda } : {}),
      } as any,
      DetallesItems: { Item: items },
      InformacionReferencia: {
        NCFModificado:      ncfModificado,
        FechaNCFModificado: infoReferencia.FechaNCFModificado,
        CodigoModificacion: codigoMod,
      },
    },
  };
}
