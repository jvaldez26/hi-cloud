import { Injectable } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { DataSource } from 'typeorm';
import { DeclaracionesService } from './declaraciones.service';
import { ProporcionalidadItbisService } from '../herramientas-fiscales/proporcionalidad-itbis/proporcionalidad-itbis.service';
import { ParametroFiscalError } from '../parametros-fiscales/errors/parametro-fiscal.errors';
import { mapFormaPagoDgii, columna607PorCodigoDgii } from './dgii.constants';

/**
 * Anexo A del IT-1 — Commit 4 del rebuild (2026-09-22).
 *
 * Reusa operacionesVentaPeriodo()/calcularSeccionIIIT1() de
 * DeclaracionesService — la MISMA fuente que ya alimenta el IT-1, no una
 * consulta paralela que pueda desviarse de él. "Un solo motor, no una copia",
 * el mismo criterio que ya se aplicó a recargos/intereses (Commit 3).
 *
 * PRINCIPIO (igual que las secciones anteriores): ninguna casilla se deja en
 * 0 sin verificar si aplica.
 */
@Injectable()
export class AnexoAService {
  constructor(
    private dataSource: DataSource,
    private tenantSvc:  TenantService,
    private declaraciones: DeclaracionesService,
    private proporcionalidadSvc: ProporcionalidadItbisService,
  ) {}

  private get eid() { return this.tenantSvc.getEmpresaId(); }

  private rango(mes: number, anio: number) {
    const desde = new Date(anio, mes - 1, 1);
    const hasta = new Date(anio, mes, 0, 23, 59, 59);
    return { desde, hasta };
  }

  private c(numero: number, monto: number, estado: 'calculada' | 'no_aplica' | 'requiere_revision' = 'calculada') {
    return { casilla: numero, monto, estado };
  }

  /**
   * Sección II — por tipo de NCF, casillas 1-11. Agrupación DINÁMICA por
   * tipoNcf (mismo espíritu que el Anexo J de conciliacion-fiscal.service.ts
   * — nunca una lista fija que descarta silenciosamente un tipo nuevo):
   * cualquier tipoNcf sin casilla propia cae en "Otras Operaciones" (9/10),
   * nunca desaparece.
   */
  private seccionII(filas: Awaited<ReturnType<DeclaracionesService['operacionesVentaPeriodo']>>) {
    // tipoNcf → casilla. Los tipos que este sistema puede emitir del lado de
    // ventas hoy: E31/E32/E33/E34 (facturación normal), E44/E45/E46
    // (regímenes especiales/gubernamental/exportación — src/ecf/builders/).
    // No hay equivalente e-CF de "12 Registro Único de Ingresos" en el
    // catálogo DGII actual, así que esa casilla queda siempre en 0.
    const CASILLA_POR_TIPO: Record<string, number> = {
      E31: 1, E32: 2, E33: 3, E34: 4, E44: 6, E45: 7, E46: 8,
    };

    const round = (n: number) => Math.round(n * 100) / 100;

    // montoFirmado ya trae el signo correcto por documento (operacionesVentaPeriodo
    // aplica signo -1 a las NC) — se acumula TAL CUAL, sin volver a aplicar
    // signo en la suma total (ese fue el bug: restarlo otra vez duplicaba el
    // efecto). Las notas de crédito, sin tipoNcf propio de "otras", quedan
    // aparte del catch-all: se separan en casilla 10 solo cuando el monto es
    // negativo Y no tiene una casilla nombrada (4 sí la tiene).
    const porCasilla = new Map<number, { cantidad: number; montoFirmado: number }>();
    for (const f of filas) {
      let casilla = CASILLA_POR_TIPO[f.tipoNcf] ?? 9; // "Otras Operaciones" — catch-all, nunca se pierde un tipo desconocido
      const montoFirmado = round(f.gravado18 + f.gravado16 + f.exento);
      if (casilla === 9 && montoFirmado < 0) casilla = 10; // "Otras Operaciones (negativas)"
      const actual = porCasilla.get(casilla) ?? { cantidad: 0, montoFirmado: 0 };
      actual.cantidad += 1;
      actual.montoFirmado = round(actual.montoFirmado + montoFirmado);
      porCasilla.set(casilla, actual);
    }
    const signado = (n: number) => porCasilla.get(n)?.montoFirmado ?? 0;
    const q       = (n: number) => porCasilla.get(n)?.cantidad ?? 0;
    // Para MOSTRAR: casillas 4 (NC) y 10 (otras negativas) se reportan como
    // magnitud positiva, igual que el formulario oficial — el signo ya está
    // aplicado en el total, no hace falta que se vea negativo en la casilla.
    const m = (n: number) => (n === 4 || n === 10) ? round(-signado(n)) : signado(n);

    const total = round(
      signado(1) + signado(2) + signado(3) + signado(4) + signado(5) +
      signado(6) + signado(7) + signado(8) + signado(9) + signado(10),
    );

    return {
      casilla1_creditoFiscal:   { casilla: 1, cantidad: q(1), monto: m(1) },
      casilla2_consumo:         { casilla: 2, cantidad: q(2), monto: m(2) },
      casilla3_notaDebito:      { casilla: 3, cantidad: q(3), monto: m(3) },
      casilla4_notaCredito:     { casilla: 4, cantidad: q(4), monto: m(4) },
      casilla5_registroUnicoIngresos: { casilla: 5, cantidad: 0, monto: 0, estado: 'no_aplica' as const,
        nota: 'No existe un tipo de e-CF equivalente a "Registro Único de Ingresos" en el catálogo DGII vigente.' },
      casilla6_regimenesEspeciales: { casilla: 6, cantidad: q(6), monto: m(6) },
      casilla7_gubernamentales:  { casilla: 7, cantidad: q(7), monto: m(7) },
      casilla8_exportaciones:    { casilla: 8, cantidad: q(8), monto: m(8) },
      casilla9_otrasPositivas:   { casilla: 9, cantidad: q(9), monto: m(9) },
      casilla10_otrasNegativas:  { casilla: 10, cantidad: q(10), monto: m(10) },
      casilla11_totalOperaciones: { casilla: 11, monto: total },
    };
  }

  /**
   * Sección III — por forma de pago, casillas 12-19 ("monto bruto", CON
   * ITBIS). Reusa mapFormaPagoDgii()/columna607PorCodigoDgii() — la misma
   * clasificación de forma de pago que ya usa getFormato607() para sus
   * columnas 17-23, mismo criterio DGII (notas de crédito exentas del
   * desglose; notas de débito sin captura de forma de pago propia, se
   * asumen "Crédito" en su totalidad).
   */
  private seccionIII(filas: Awaited<ReturnType<DeclaracionesService['operacionesVentaPeriodo']>>) {
    const montos: Record<'efectivo' | 'chequeTransferencia' | 'tarjeta' | 'credito' | 'permuta' | 'otras', number> = {
      efectivo: 0, chequeTransferencia: 0, tarjeta: 0, credito: 0, permuta: 0, otras: 0,
    };
    let sinFormaPago = 0;

    for (const f of filas) {
      if (f.tipoDocumento === 'NOTA_CREDITO') continue; // exenta del desglose por regla DGII
      if (f.tipoDocumento === 'NOTA_DEBITO') { montos.credito += f.total; continue; }
      if (f.formasPago.length === 0) { sinFormaPago += f.total; continue; }
      for (const fp of f.formasPago) {
        const columna = columna607PorCodigoDgii(mapFormaPagoDgii(Number(fp.tipo)));
        if (columna) montos[columna] += Number(fp.monto ?? 0);
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const casilla18 = round(montos.otras + sinFormaPago);
    const total = round(montos.efectivo + montos.chequeTransferencia + montos.tarjeta + montos.credito + 0 + montos.permuta + casilla18);

    const avisos: string[] = [];
    if (sinFormaPago > 0) {
      avisos.push(`RD$${round(sinFormaPago).toFixed(2)} en facturas sin forma de pago capturada (anteriores a esa columna) se sumaron a "Otras formas de venta" (casilla 18).`);
    }
    avisos.push('Casilla 16 (bonos o certificado de regalo): no aplica — el sistema no distingue esa forma de pago de "Otras formas de venta".');

    return {
      seccion: {
        casilla12_efectivo:            this.c(12, round(montos.efectivo)),
        casilla13_chequeTransferencia: this.c(13, round(montos.chequeTransferencia)),
        casilla14_tarjeta:             this.c(14, round(montos.tarjeta)),
        casilla15_aCredito:            this.c(15, round(montos.credito)),
        casilla16_bonos:               this.c(16, 0, 'no_aplica'),
        casilla17_permutas:            this.c(17, round(montos.permuta)),
        casilla18_otras:               this.c(18, casilla18),
        casilla19_total:               this.c(19, total),
      },
      avisos,
    };
  }

  /**
   * Sección IV — por tipo de ingreso, casillas 20-26. Este sistema no
   * distingue ingresos financieros/extraordinarios/arrendamiento/venta de
   * activos de los ingresos por operaciones — todo el total de operaciones
   * (casilla 1 del IT-1) cae en la casilla 20, el resto no_aplica.
   */
  private seccionIV(casilla1TotalOperaciones: number) {
    return {
      seccion: {
        casilla20_ingresosOperaciones:      this.c(20, casilla1TotalOperaciones),
        casilla21_ingresosFinancieros:      this.c(21, 0, 'no_aplica'),
        casilla22_ingresosExtraordinarios:  this.c(22, 0, 'no_aplica'),
        casilla23_ingresosArrendamientos:   this.c(23, 0, 'no_aplica'),
        casilla24_ventaActivosDepreciables: this.c(24, 0, 'no_aplica'),
        casilla25_otrosIngresos:            this.c(25, 0, 'no_aplica'),
        casilla26_total:                    this.c(26, casilla1TotalOperaciones),
      },
      avisos: [
        'Casillas 21-25 (ingresos financieros/extraordinarios/arrendamientos/venta de activos/otros): no aplica — ' +
        'el sistema no distingue estos tipos de ingreso de las operaciones normales; todo cae en la casilla 20.',
      ],
    };
  }

  /**
   * Sección IX — ITBIS Pagado, casillas 45-56. Mismo criterio "compras
   * locales" del IT-1 (casilla 22): no hay señal para distinguir bienes de
   * servicios ni compras locales de importaciones, así que todo el ITBIS
   * deducible se reporta en la columna "Compras Locales".
   *
   * Proporcionalidad (Art. 349, columna C): si el período NO tiene ninguna
   * venta local exenta (casillas 4+6+7+8 del IT-1 en 0 — exportaciones y
   * exención por destino no reducen el derecho a crédito), el 100% del
   * ITBIS pagado es deducible sin necesidad de calcular el coeficiente —
   * pedido explícito del usuario. Si SÍ hay exención local, no hay forma de
   * saber qué compra específica corresponde a qué tipo de venta, así que
   * TODO el ITBIS pagado se trata como "común" (columna C) y se le aplica
   * el coeficiente — nunca se reparte a ciegas entre deducible (B) y no
   * deducible (A).
   */
  private async seccionIX(
    itbisPagadoTotal: number,
    casilla2: number, casilla4: number, casilla10: number, casilla1: number,
    hasta: Date,
  ) {
    const avisos: string[] = [
      'Casillas 45-47 (ITBIS no deducible) y 49/51 (deducible en exportaciones/servicios): no aplica — ' +
      'el sistema no distingue, por compra, a qué tipo de venta corresponde.',
      'Columnas "Servicios" e "Importaciones": no aplica — todo el ITBIS deducible se reporta en "Compras Locales" (mismo criterio que la casilla 22 del IT-1).',
    ];

    const round = (n: number) => Math.round(n * 100) / 100;
    const sinExencionLocal = round(casilla4) === 0; // exportaciones/exención-por-destino no cuentan como exención local

    if (sinExencionLocal || itbisPagadoTotal === 0) {
      avisos.push('100% del período gravado (o sin ITBIS pagado que repartir) — no fue necesario calcular el coeficiente de proporcionalidad.');
      return {
        noDeducible: {
          casilla45_productoresExentos: this.c(45, 0, 'no_aplica'),
          casilla46_activosCategoriaI:  this.c(46, 0, 'no_aplica'),
          casilla47_otrosNoDeducibles:  this.c(47, 0, 'no_aplica'),
          casilla48_totalNoDeducible:   this.c(48, 0),
        },
        deducibleNoSujetoAProporcionalidad: {
          casilla49_bienesExportados: this.c(49, 0, 'no_aplica'),
          casilla50_bienesGravados:   this.c(50, round(itbisPagadoTotal)),
          casilla51_serviciosGravados: this.c(51, 0, 'no_aplica'),
          casilla52_total:            this.c(52, round(itbisPagadoTotal)),
        },
        sujetoAProporcionalidad: {
          casilla53_itbisSujeto: this.c(53, 0, 'no_aplica'),
          casilla54_coeficiente: this.c(54, 100, 'no_aplica'),
          casilla55_itbisAdmitido: this.c(55, 0, 'no_aplica'),
        },
        casilla56_totalItbisDeducible: this.c(56, round(itbisPagadoTotal)),
        avisos,
      };
    }

    const fecha = hasta.toISOString().slice(0, 10);
    try {
      const resultado = await this.proporcionalidadSvc.calcular({
        fecha, ventasGravadas: casilla10, ventasExportaciones: casilla2, ventasExentas: casilla4,
        itbisComun: itbisPagadoTotal,
      });
      avisos.push(`Coeficiente de proporcionalidad: ${(resultado.factor * 100).toFixed(2)}% — ver Herramientas Fiscales para el detalle del período (mensual con ajuste anual / anual).`);
      return {
        noDeducible: {
          casilla45_productoresExentos: this.c(45, 0, 'no_aplica'),
          casilla46_activosCategoriaI:  this.c(46, 0, 'no_aplica'),
          casilla47_otrosNoDeducibles:  this.c(47, 0, 'no_aplica'),
          casilla48_totalNoDeducible:   this.c(48, 0),
        },
        deducibleNoSujetoAProporcionalidad: {
          casilla49_bienesExportados: this.c(49, 0, 'no_aplica'),
          casilla50_bienesGravados:   this.c(50, 0, 'no_aplica'),
          casilla51_serviciosGravados: this.c(51, 0, 'no_aplica'),
          casilla52_total:            this.c(52, 0),
        },
        sujetoAProporcionalidad: {
          casilla53_itbisSujeto:   this.c(53, round(itbisPagadoTotal)),
          casilla54_coeficiente:   this.c(54, round(resultado.factor * 100)),
          casilla55_itbisAdmitido: this.c(55, round(resultado.itbisDeducible)),
        },
        casilla56_totalItbisDeducible: this.c(56, round(resultado.itbisDeducible)),
        avisos,
      };
    } catch (err: any) {
      const motivo = err instanceof ParametroFiscalError ? err.message : `error inesperado: ${err?.message ?? err}`;
      avisos.push(`Casillas 53-56 (proporcionalidad): requiere revisión — ${motivo} El período tiene ventas exentas locales, así que no se puede asumir 100% deducible.`);
      return {
        noDeducible: {
          casilla45_productoresExentos: this.c(45, 0, 'no_aplica'),
          casilla46_activosCategoriaI:  this.c(46, 0, 'no_aplica'),
          casilla47_otrosNoDeducibles:  this.c(47, 0, 'no_aplica'),
          casilla48_totalNoDeducible:   this.c(48, 0),
        },
        deducibleNoSujetoAProporcionalidad: {
          casilla49_bienesExportados: this.c(49, 0, 'no_aplica'),
          casilla50_bienesGravados:   this.c(50, 0, 'no_aplica'),
          casilla51_serviciosGravados: this.c(51, 0, 'no_aplica'),
          casilla52_total:            this.c(52, 0),
        },
        sujetoAProporcionalidad: {
          casilla53_itbisSujeto:   this.c(53, round(itbisPagadoTotal), 'requiere_revision'),
          casilla54_coeficiente:   this.c(54, 0, 'requiere_revision'),
          casilla55_itbisAdmitido: this.c(55, 0, 'requiere_revision'),
        },
        casilla56_totalItbisDeducible: this.c(56, 0, 'requiere_revision'),
        avisos,
      };
    }
  }

  async getAnexoA(mes: number, anio: number) {
    const { desde, hasta } = this.rango(mes, anio);
    const eid = this.eid;

    const filas = await this.declaraciones.operacionesVentaPeriodo(desde, hasta);
    const seccionII_calc = this.declaraciones.calcularSeccionIIIT1(filas);

    const seccionII  = this.seccionII(filas);
    const seccionIII = this.seccionIII(filas);
    const seccionIV  = this.seccionIV(seccionII_calc.casilla1_totalOperaciones.monto);

    // Mismo criterio del 606 para "compras con comprobante fiscal completo" — igual que IT-1 casilla 22.
    const [comprasRow] = await this.dataSource.query<{ itbis: string }[]>(
      `SELECT COALESCE(SUM(c.itbis), 0) AS itbis FROM compras c
        WHERE c."empresaId" = $1 AND c.fecha BETWEEN $2 AND $3
          AND c.estado IN ('recibida','pagada') AND c."isActive" = true`,
      [eid, desde, hasta],
    );
    const [gastosRow] = await this.dataSource.query<{ itbis: string }[]>(
      `SELECT COALESCE(SUM(g.itbis), 0) AS itbis FROM gastos g
        WHERE g."empresaId" = $1 AND g.fecha BETWEEN $2 AND $3 AND g."isActive" = true
          AND g.categoria != 'gasto_menor'
          AND g.comprobante IS NOT NULL AND g.comprobante != ''
          AND g."rncProveedor" IS NOT NULL AND g."rncProveedor" != ''
          AND g."tipoBienes" IS NOT NULL AND g."formaPago" IS NOT NULL AND g.itbis > 0`,
      [eid, desde, hasta],
    );
    const itbisPagadoTotal = Math.round((Number(comprasRow?.itbis ?? 0) + Number(gastosRow?.itbis ?? 0)) * 100) / 100;

    const seccionIX = await this.seccionIX(
      itbisPagadoTotal,
      seccionII_calc.noGravadas.casilla2_exportacionBienes.monto,
      seccionII_calc.noGravadas.casilla4_exentasLocales.monto,
      seccionII_calc.gravadas.casilla10_totalGravadas.monto,
      seccionII_calc.casilla1_totalOperaciones.monto,
      hasta,
    );

    return {
      periodo: { mes, anio },
      seccionII, seccionIII: seccionIII.seccion, seccionIV: seccionIV.seccion, seccionIX,
      avisos: [...seccionIII.avisos, ...seccionIV.avisos, ...seccionIX.avisos],
    };
  }
}
