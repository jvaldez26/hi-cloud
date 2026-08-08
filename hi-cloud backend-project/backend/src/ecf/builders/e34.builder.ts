/**
 * E34 — Nota de Crédito Electrónica
 * InformacionReferencia: NCFModificado → FechaNCFModificado → CodigoModificacion
 * FechaVencimientoSecuencia: NO incluir (doc de modificación).
 * IndicadorNotaCredito: calculado dinámicamente (≤30d=0, >30d=1).
 * Si moneda extranjera: montos principales en RD$, OtraMoneda/OtraMonedaDetalle.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, addDias,
  buildCompradorRNC,
  buildTotalesCero,
  EcfRncRequeridoError,
  resolverMoneda,
  round2,
} from './base-ecf.builder';
import { fmtFecha } from './sections/id-doc.section';
import { Logger } from '@nestjs/common';
import { warnCuadraturaDGII, truncarNombreItem } from './sections/items.section';

const logger = new Logger('E34Builder');

function cap4(n: number | string): number { return parseFloat(Number(n).toFixed(4)); }

const CODIGOS_MODIFICACION_E34: Record<string, string> = {
  '1': 'Anulación total',
  '2': 'Corrección de texto (montos = 0)',
  '3': 'Ajuste de montos/devolución',
  '4': 'Reemplazo por contingencia',
  '5': 'Referencia a Factura de Consumo E32',
};

function calcIndicadorNC(fechaNcfModificado: string): '0' | '1' {
  try {
    const parts = fechaNcfModificado.split('-');
    if (parts.length !== 3) return '0';
    const [dd, mm, yyyy] = parts.map(Number);
    // Anclar ambas fechas al mediodía RD (16:00 UTC) para comparación calendar-day estable.
    // Evita que la diferencia de UTC-4 cruce el límite de día en horas nocturnas RD.
    const orig = new Date(Date.UTC(yyyy, mm - 1, dd, 16));
    const rdHoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' })
      .format(new Date()).split('-').map(Number);
    const hoy  = new Date(Date.UTC(rdHoy[0], rdHoy[1] - 1, rdHoy[2], 16));
    const dias = Math.round((hoy.getTime() - orig.getTime()) / 86_400_000);
    return dias <= 30 ? '0' : '1';
  } catch { return '0'; }
}

export function buildE34(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, infoReferencia } = input;

  if (!infoReferencia?.NCFModificado) {
    throw new Error('E34 requiere infoReferencia.NCFModificado (eNCF de la factura original)');
  }

  const codigoMod = String(infoReferencia.CodigoModificacion ?? '3');
  if (!CODIGOS_MODIFICACION_E34[codigoMod]) {
    throw new Error(
      `CodigoModificacion "${codigoMod}" inválido para E34. ` +
      `Válidos: ${Object.entries(CODIGOS_MODIFICACION_E34).map(([k, v]) => `${k}=${v}`).join(', ')}`,
    );
  }

  const cliente      = factura.cliente as any;
  const rnc          = cliente?.rncReceptor ?? cliente?.rfc ?? '';
  const tipoOriginal = infoReferencia.NCFModificado.substring(0, 3);
  if (tipoOriginal === 'E31' && (!rnc || rnc === '00000000000')) {
    throw new EcfRncRequeridoError(34, Number(factura.total));
  }

  // Validación de formato (warn sin bloquear) — RNC debe ser 9 dígitos (empresa)
  // o 11 dígitos (cédula persona natural). Ambos van en RNCComprador según spec MSeller.
  // Si el formato falla, la emisión continúa pero se registra para corrección de datos.
  if (rnc && rnc !== '00000000000') {
    const digits = rnc.replace(/\D/g, '');
    if (digits.length !== 9 && digits.length !== 11) {
      logger.warn(
        `[E34] RNCComprador con formato inválido: "${rnc}" (${digits.length} dígitos; ` +
        `esperado 9=RNC o 11=cédula). Cliente: "${cliente?.nombre ?? 'desconocido'}". ` +
        `La emisión continúa — revisar datos del cliente en DB.`,
      );
    }
  }

  const mc         = resolverMoneda(factura);
  const detallesME = factura.detalles as any[] ?? [];
  const fecha      = fmtFecha(factura.fecha ?? new Date());
  const emisor     = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  // FechaLimitePago: usar la fecha de vencimiento real de la factura.
  // Antes se calculaba siempre como fecha+30 días, ignorando diasCredito y fechaVencimiento.
  const fechaLimite = factura.fechaVencimiento
    ? fmtFecha(factura.fechaVencimiento)
    : addDias(factura.fecha ?? new Date(), factura.diasCredito || 30);
  const indicadorNC = calcIndicadorNC(infoReferencia.FechaNCFModificado);

  // ── ITEMS: DOP como principal, OtraMonedaDetalle si USD ──────────────────
  const items = detallesME.map((d: any, idx: number) => {
    warnCuadraturaDGII(d, encf);
    const precioME = Number(d.precioUnitario);
    const montoME  = Number(d.subtotal);
    const pct      = parseFloat(String(d.porcentajeIva ?? 18));
    const indFact  = pct === 18 ? 1 : pct === 16 ? 2 : pct === 0 ? 4
      : (() => { throw new Error(`[E34] porcentajeIva inválido: ${pct}. Valores válidos: 0, 16, 18`); })();
    const otME     = mc.otraMonedaItem(precioME, montoME);
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indFact,
      NombreItem:             truncarNombreItem(d.descripcion, encf),
      IndicadorBienoServicio: 1,
      CantidadItem:           cap4(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(mc.toDOP(precioME)),
      ...(otME ? { OtraMonedaDetalle: otME } : {}),
      MontoItem:              round2(mc.toDOP(montoME)),
    };
  });

  // ── TOTALES: calcular desde items en DOP ──────────────────────────────────
  let montoGravado18 = 0, montoGravado16 = 0, montoExento = 0;
  let itbis18 = 0, itbis16 = 0;
  detallesME.forEach((d: any) => {
    const pct = parseFloat(String(d.porcentajeIva ?? 18));
    const sub = round2(mc.toDOP(Number(d.subtotal)));
    const iva = round2(mc.toDOP(Number(d.importeIva ?? d.iva ?? 0)));
    if (pct === 18)      { montoGravado18 += sub; itbis18 += iva; }
    else if (pct === 16) { montoGravado16 += sub; itbis16 += iva; }
    else                 { montoExento += sub; }
  });
  const montoGravadoTotal = round2(montoGravado18 + montoGravado16);
  const hayGravado: 0 | 1 = montoGravadoTotal > 0 ? 1 : 0;
  const totalITBIS = round2(itbis18 + itbis16);
  const montoTotal = round2(montoGravadoTotal + montoExento + totalITBIS);

  const totales = codigoMod === '2'
    ? buildTotalesCero()
    : (() => {
        const t: Record<string, unknown> = {};
        // Orden estricto XSD DGII: MontoGravadoXX → MontoExento → ITBISXX → TotalITBISXX → MontoTotal
        const hayI1 = montoGravado18 > 0;
        const hayI2 = montoGravado16 > 0;
        if (hayI1 || hayI2) t['MontoGravadoTotal'] = montoGravadoTotal;
        if (hayI1)          t['MontoGravadoI1']    = round2(montoGravado18);
        if (hayI2)          t['MontoGravadoI2']    = round2(montoGravado16);
        if (montoExento > 0) t['MontoExento']      = round2(montoExento);
        if (hayI1)          t['ITBIS1']            = 18;
        if (hayI2)          t['ITBIS2']            = 16;
        if (hayI1 || hayI2) t['TotalITBIS']        = totalITBIS;
        if (hayI1)          t['TotalITBIS1']       = round2(itbis18);
        if (hayI2)          t['TotalITBIS2']       = round2(itbis16);
        t['MontoTotal'] = montoTotal;
        return t;
      })();

  // ── OTRAMONEDA: hermana de Totales, calculada desde items USD ─────────────
  let otraMoneda: Record<string, unknown> | undefined;
  if (mc.esME && codigoMod !== '2') {
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
      TipoMoneda:                    mc.moneda,
      TipoCambio:                    mc.tasa.toFixed(4),
      MontoGravadoTotalOtraMoneda:   round2(montoGrav1ME).toFixed(2),
      MontoGravado1OtraMoneda:       round2(montoGrav1ME).toFixed(2),
      ...(montoExentoME > 0 ? { MontoExentoOtraMoneda: round2(montoExentoME).toFixed(2) } : {}),
      TotalITBISOtraMoneda:          round2(itbis1ME).toFixed(2),
      TotalITBIS1OtraMoneda:         round2(itbis1ME).toFixed(2),
      MontoTotalOtraMoneda:          montoTotalME.toFixed(2),
    };
  }

  logger.debug(`[E34] moneda=${(factura as any).moneda ?? 'DOP'} otraMoneda=${!!otraMoneda}`);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                   34,
          encf,
          indicadorNotaCredito:   indicadorNC,
          indicadorEnvioDiferido: 1,
          indicadorMontoGravado:  hayGravado === 1 ? 0 : undefined,
          tipoIngresos:           '01',
          tipoPago:               2,
          fechaLimitePago:        fechaLimite,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(
          rnc || '00000000000',
          cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales:   totales,
        ...(otraMoneda ? { OtraMoneda: otraMoneda } : {}),
      } as any,
      DetallesItems: { Item: items },
      InformacionReferencia: {
        NCFModificado:      infoReferencia.NCFModificado,
        FechaNCFModificado: infoReferencia.FechaNCFModificado,
        CodigoModificacion: codigoMod,
      },
    },
  };
}
