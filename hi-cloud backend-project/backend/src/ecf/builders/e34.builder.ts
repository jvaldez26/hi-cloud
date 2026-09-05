/**
 * E34 — Nota de Crédito Electrónica
 * InformacionReferencia: NCFModificado → FechaNCFModificado → CodigoModificacion
 * FechaVencimientoSecuencia: NO incluir (doc de modificación).
 * IndicadorNotaCredito: calculado dinámicamente (≤30d=0, >30d=1). Valor y
 * posición dentro de IdDoc (después de eNCF, antes de IndicadorEnvioDiferido)
 * verificados contra el "Formato Comprobante Fiscal Electrónico (e-CF) v1.0"
 * de la DGII (oct-2025) — no requiere '1'/'2' por tener o no referencia; ese
 * indicador solo existe para E34 y solo depende de los 30 días calendario.
 * Si FechaNCFModificado queda en el futuro, calcIndicadorNC lanza (dato de
 * origen corrupto: ver caso E340000000007).
 * Si moneda extranjera: montos principales en RD$, OtraMoneda/OtraMonedaDetalle.
 */
import {
  ECFBuildInput, MSellerPayload,
  buildEmisor, assertEmisorOrder, toEmpresaConfig,
  buildIdDoc, addDias,
  buildCompradorRNC,
  resolverCompradorNota,
  normalizarRnc,
  buildTotalesCero,
  EcfRncRequeridoError,
  resolverMoneda,
  round2,
} from './base-ecf.builder';
import { fmtFecha } from './sections/id-doc.section';
import { Logger, BadRequestException } from '@nestjs/common';
import { buildItems } from './sections/items.section';

const logger = new Logger('E34Builder');

const CODIGOS_MODIFICACION_E34: Record<string, string> = {
  '1': 'Anulación total',
  '2': 'Corrección de texto (montos = 0)',
  '3': 'Ajuste de montos/devolución',
  '4': 'Reemplazo por contingencia',
  '5': 'Referencia a Factura de Consumo E32',
};

function calcIndicadorNC(fechaNcfModificado: string): '0' | '1' {
  if (!fechaNcfModificado) return '0';
  const parts = fechaNcfModificado.split('-');
  if (parts.length !== 3) return '0';
  const [dd, mm, yyyy] = parts.map(Number);
  if (![dd, mm, yyyy].every(Number.isFinite)) return '0';
  // Anclar ambas fechas al mediodía RD (16:00 UTC) para comparación calendar-day estable.
  // Evita que la diferencia de UTC-4 cruce el límite de día en horas nocturnas RD.
  const orig = new Date(Date.UTC(yyyy, mm - 1, dd, 16));
  const rdHoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' })
    .format(new Date()).split('-').map(Number);
  const hoy  = new Date(Date.UTC(rdHoy[0], rdHoy[1] - 1, rdHoy[2], 16));
  const dias = Math.round((hoy.getTime() - orig.getTime()) / 86_400_000);
  // dias < 0 = el comprobante que se modifica queda fechado DESPUÉS de hoy — un
  // dato de origen corrupto (factura con año mal tecleado, típicamente). DGII
  // rechaza el IndicadorNotaCredito resultante con error 156 ("no es válido")
  // porque no hay un valor 0/1 coherente para una referencia futura. Se corta
  // aquí, en la construcción en seco previa a pedir el eNCF (ver más abajo),
  // en vez de quemar una secuencia real para terminar en el mismo rechazo.
  // Caso real: E340000000007 (empresa 59) referenciaba una factura fechada
  // "2027" por error de captura, un año después de su propia fecha de emisión.
  if (dias < 0) {
    // BadRequestException, no Error: así el filtro global de NestJS lo devuelve
    // como 400 con este mensaje. Como Error crudo, el usuario solo veía
    // "Error interno del servidor" — el mensaje real quedaba solo en el log.
    throw new BadRequestException(
      `[E34] La fecha del comprobante que se modifica (${fechaNcfModificado}) es posterior a hoy. ` +
      'Corrija la fecha de la factura/e-CF original antes de emitir la Nota de Crédito.',
    );
  }
  return dias <= 30 ? '0' : '1';
}

export function buildE34(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, infoReferencia, compradorOriginal } = input;

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

  // El comprador sale del e-CF que la nota modifica, no del cliente vinculado.
  // La DGII compara el RNCComprador de la nota contra el de la factura
  // referenciada y rechaza con código 615 quemando la secuencia; leer del
  // cliente hacía salir "consumidor final" en notas sobre facturas emitidas a
  // un contribuyente real. Si no coinciden, esto lanza en la construcción en
  // seco — antes de pedir número.
  const cliente      = factura.cliente as any;
  const comprador    = resolverCompradorNota(34, infoReferencia.NCFModificado, cliente, compradorOriginal);
  const rnc          = comprador.rnc;
  const tipoOriginal = infoReferencia.NCFModificado.substring(0, 3);
  // normalizarRnc colapsa cualquier largo de ceros: el centinela literal de 11
  // ceros dejaba pasar el '000000000' de 9 que llevan los clientes genéricos.
  if (tipoOriginal === 'E31' && !normalizarRnc(rnc)) {
    throw new EcfRncRequeridoError(34, Number(factura.total));
  }

  // El aviso de formato inválido (ni 9 ni 11 dígitos) lo emite buildCompradorRNC,
  // que ahora recibe el encf para identificar el documento en el log.

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
  // Validación estricta de porcentajeIva (E34 solo admite 0, 16, 18).
  for (const d of detallesME) {
    const pct = parseFloat(String((d as any).porcentajeIva ?? 18));
    if (pct !== 0 && pct !== 16 && pct !== 18) {
      throw new Error(`[E34] porcentajeIva inválido: ${pct}. Valores válidos: 0, 16, 18`);
    }
  }
  // buildItems gestiona DescuentoMonto+TablaSubDescuento y cuadratura exacta (adv. 2394).
  const items = buildItems(detallesME, encf, {
    toDOP:          (v) => mc.toDOP(v),
    otraMonedaItem: (p, m) => mc.otraMonedaItem(p, m) ?? undefined,
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
          comprador.razonSocial,
          comprador.direccion ? { DireccionComprador: comprador.direccion } : undefined,
          encf,
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
