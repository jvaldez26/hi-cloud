import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { AsientosAutomaticosService } from '../../contabilidad/services/asientos-automaticos.service';
import { TipoOrigenAsiento } from '../../contabilidad/entities/asiento-contable.entity';
import { EmitirECFUseCase } from '../../ecf/use-cases/emitir-ecf.use-case';
import { DocumentoOrigenTipo } from '../../ecf/entities/ecf.entity';
import { TenantService } from '../../tenant/tenant.service';
import { FeriadosService } from '../feriados/feriados.service';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';
import { clasificarMorosidad, r2 } from '../utils/mora.util';
import { ParametrosMora } from '../motor/mora-v2.util';
import { calcularTablaAmortizacion } from '../motor/amortizacion-v2.util';
import { resolverMotorConfig, construirParametrosPrestamo, aniosDelPlazo } from '../motor/motor-adaptador.util';
import { distribuirPago, calcularSaldoLiquidacion, moraACuotaEnFecha, CuotaPendiente, TipoPago, DestinoExcedente, ResultadoDistribucion } from './pagos-calculo.util';

@Injectable()
export class PagosService {
  private readonly logger = new Logger(PagosService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly asientos: AsientosAutomaticosService,
    private readonly emitirEcf: EmitirECFUseCase,
    private readonly tenantSvc: TenantService,
    private readonly feriadosSvc: FeriadosService,
  ) {}

  /**
   * C1 — ver PrPago.claveIdempotencia. Mismo contrato que
   * FacturasService.buscarPorClaveIdempotencia / ComprasService.buscarPorClaveIdempotencia.
   */
  private async buscarPorClaveIdempotencia(empresaId: number, claveIdempotencia: string | undefined): Promise<any | null> {
    if (!claveIdempotencia) return null;
    const [row] = await this.ds.query(
      `SELECT * FROM pr_pagos WHERE "empresaId"=$1 AND "claveIdempotencia"=$2`,
      [empresaId, claveIdempotencia],
    );
    return row ?? null;
  }

  /** Reconstruye la respuesta de registrar() para un pago YA existente (hit de idempotencia). */
  private async respuestaDePagoExistente(empresaId: number, pago: any) {
    const [p] = await this.ds.query(
      `SELECT "saldoCapital","saldoInteres","saldoMora","saldoTotal" FROM pr_prestamos WHERE id=$1 AND "empresaId"=$2`,
      [pago.prestamoId, empresaId],
    );
    return {
      pago,
      cuotasAfectadas: pago.cuotasAfectadas ?? [],
      saldos: {
        saldoCapital: Number(p?.saldoCapital ?? 0),
        saldoInteres: Number(p?.saldoInteres ?? 0),
        saldoMora: Number(p?.saldoMora ?? 0),
        saldoTotal: Number(p?.saldoTotal ?? 0),
      },
    };
  }

  async findByPrestamo(empresaId: number, prestamoId: number) {
    return this.ds.query(
      `SELECT * FROM pr_pagos WHERE "prestamoId"=$1 AND "empresaId"=$2 ORDER BY fecha DESC`,
      [prestamoId, empresaId],
    );
  }

  async findOne(empresaId: number, id: number) {
    const rows: any[] = await this.ds.query(
      `SELECT * FROM pr_pagos WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!rows[0]) throw new NotFoundException(`Pago #${id} no encontrado`);
    return rows[0];
  }

  private esFechaAnterior(fecha: string | undefined): boolean {
    if (!fecha) return false;
    return fecha < fechaHoyRD();
  }

  /** Mora pendiente de cada cuota, resuelta UNA vez — stored (hoy) o recalculada a `fecha` si el pago es retroactivo. */
  private construirMapaMora(
    cuotas: CuotaPendiente[], diasGracia: number, porcentajeMora: number,
    moraConfigV2: ParametrosMora | null, fecha: string,
  ): Map<number, number> {
    const retroactivo = this.esFechaAnterior(fecha);
    const mapa = new Map<number, number>();
    for (const c of cuotas) {
      const v = retroactivo
        ? moraACuotaEnFecha(c, fecha, diasGracia, porcentajeMora, moraConfigV2)
        : r2(Number(c.moraGenerada) - Number(c.moraPagada));
      mapa.set(c.id, Math.max(0, v));
    }
    return mapa;
  }

  /** `cuotasSeleccionadas` debe ser exactamente el prefijo (las K más viejas) de `pendientesOrdenadas` — nunca saltar una. */
  private seleccionarEnOrden(pendientesOrdenadas: CuotaPendiente[], cuotasSeleccionadas: number[]): CuotaPendiente[] {
    const prefijo = pendientesOrdenadas.slice(0, cuotasSeleccionadas.length);
    const idsPrefijo = new Set(prefijo.map(c => c.id));
    const idsSel = new Set(cuotasSeleccionadas);
    if (idsSel.size !== idsPrefijo.size || ![...idsSel].every(id => idsPrefijo.has(id))) {
      throw new BadRequestException('Las cuotas deben pagarse en orden, empezando por la más antigua pendiente');
    }
    return prefijo;
  }

  /**
   * Resuelve TODO lo necesario para aplicar o previsualizar un pago, sin
   * escribir nada. Única fuente de verdad compartida entre preview() (no
   * persiste) y registrar() (persiste) — lo que el cajero ve en la vista
   * previa es exactamente lo que el servidor aplica.
   */
  private async prepararOperacion(queryable: { query: (sql: string, params?: any[]) => Promise<any> }, empresaId: number, data: any, bloquear: boolean) {
    const [prestamo] = await queryable.query(
      `SELECT * FROM pr_prestamos WHERE id=$1 AND "empresaId"=$2${bloquear ? ' FOR UPDATE' : ''}`,
      [data.prestamoId, empresaId],
    );
    if (!prestamo) throw new NotFoundException(`Préstamo #${data.prestamoId} no encontrado`);
    if (prestamo.estado === 'cancelado' || prestamo.estado === 'pagado') {
      throw new BadRequestException('El préstamo ya está cerrado');
    }

    const pendientesOrdenadas: CuotaPendiente[] = await queryable.query(
      `SELECT * FROM pr_cuotas WHERE "prestamoId"=$1 AND estado<>'pagada' ORDER BY "numeroCuota"${bloquear ? ' FOR UPDATE' : ''}`,
      [data.prestamoId],
    );

    const moraConfigV2: ParametrosMora | null = prestamo.motorVersion === 'v2' ? (prestamo.motorConfig?.mora ?? null) : null;
    const diasGracia = Number(prestamo.diasGracia ?? 0);
    const porcentajeMora = Number(prestamo.porcentajeMora ?? 0);
    const fecha = data.fecha ?? fechaHoyRD();
    const mapaMora = this.construirMapaMora(pendientesOrdenadas, diasGracia, porcentajeMora, moraConfigV2, fecha);

    const tipoPago: TipoPago = data.tipoPago ?? 'cuotas';
    const config = resolverMotorConfig(prestamo);
    const destinoExcedente: DestinoExcedente = data.destinoExcedente ?? config.excedentePago?.destino ?? 'siguientes_cuotas';

    let cuotasParaDistribuir: CuotaPendiente[];
    let montoParaDistribuir = r2(Number(data.montoPagado));
    let totalLiquidacion: number | null = null;

    if (tipoPago === 'abono_parcial') {
      if (!pendientesOrdenadas.length) throw new BadRequestException('No hay cuotas pendientes en este préstamo');
      cuotasParaDistribuir = [pendientesOrdenadas[0]];
    } else if (tipoPago === 'liquidar') {
      totalLiquidacion = calcularSaldoLiquidacion(pendientesOrdenadas, fecha, diasGracia, porcentajeMora, moraConfigV2);
      // En preview (bloquear=false) nunca exige que el cliente ya sepa el
      // monto exacto — para eso es la vista previa. registrar() (bloquear=
      // true) sí lo exige: el monto persistido tiene que coincidir con lo
      // que el cajero vio y confirmó, nunca uno que el servidor "corrigió"
      // en silencio.
      if (bloquear && Math.abs(totalLiquidacion - montoParaDistribuir) > 0.01) {
        throw new BadRequestException(`Para liquidar el préstamo el monto exacto a la fecha es RD$ ${totalLiquidacion.toFixed(2)}`);
      }
      montoParaDistribuir = totalLiquidacion;
      cuotasParaDistribuir = pendientesOrdenadas;
    } else if (tipoPago === 'abono_extraordinario_capital') {
      cuotasParaDistribuir = data.cuotasSeleccionadas?.length
        ? this.seleccionarEnOrden(pendientesOrdenadas, data.cuotasSeleccionadas)
        : [];
    } else {
      if (!data.cuotasSeleccionadas?.length) throw new BadRequestException('Selecciona al menos una cuota a pagar');
      const seleccionadas = this.seleccionarEnOrden(pendientesOrdenadas, data.cuotasSeleccionadas);
      // destino='siguientes_cuotas' (default): se distribuye sobre TODAS las
      // pendientes — paga las seleccionadas y cualquier excedente sigue con
      // las siguientes en orden, sin pedirle una segunda operación al cajero.
      // destino='capital': solo las seleccionadas: lo que sobre nunca toca
      // la siguiente cuota, se vuelve abono extraordinario más abajo.
      cuotasParaDistribuir = destinoExcedente === 'capital' ? seleccionadas : pendientesOrdenadas;
    }

    const dist = distribuirPago(cuotasParaDistribuir, montoParaDistribuir, mapaMora);

    let montoExtraCapital = 0;
    if (tipoPago === 'abono_extraordinario_capital') {
      montoExtraCapital = r2(montoParaDistribuir - dist.totalAplicado);
    } else if (dist.restanteSinAplicar > 0) {
      if (destinoExcedente === 'capital') {
        montoExtraCapital = dist.restanteSinAplicar;
      } else {
        const totalParaMensaje = totalLiquidacion ?? calcularSaldoLiquidacion(pendientesOrdenadas, fecha, diasGracia, porcentajeMora, moraConfigV2);
        throw new BadRequestException(
          `El monto excede el saldo total del préstamo. Usa "Liquidar préstamo" (RD$ ${totalParaMensaje.toFixed(2)}).`,
        );
      }
    }

    return {
      prestamo, pendientesOrdenadas, dist, montoExtraCapital, fecha, tipoPago, destinoExcedente,
      config, moraConfigV2, diasGracia, porcentajeMora,
      montoTotalAplicado: r2(dist.totalAplicado + montoExtraCapital),
    };
  }

  /**
   * Vista previa — mismo cálculo exacto que registrar(), sin transacción ni
   * bloqueo: de solo lectura, no persiste nada.
   */
  async preview(empresaId: number, data: any) {
    const r = await this.prepararOperacion(this.ds, empresaId, data, false);
    return {
      tipoPago: r.tipoPago,
      destinoExcedente: r.destinoExcedente,
      lineas: r.dist.lineas,
      aplicadoMora: r.dist.aplicadoMora,
      aplicadoInteres: r.dist.aplicadoInteres,
      aplicadoCapital: r.dist.aplicadoCapital,
      aplicadoCargos: r.dist.aplicadoCargos,
      montoExtraCapital: r.montoExtraCapital,
      montoTotalAplicado: r.montoTotalAplicado,
      cuotasQuedanPagadas: r.dist.lineas.filter(l => l.quedaPagada).length,
    };
  }

  /**
   * Reemplaza las cuotas TOTALMENTE pendientes (sin ningún pago aplicado, ni
   * antes de esta operación ni en `dist`) por una tabla recalculada con el
   * motor v2 sobre el capital reducido — abono_extraordinario_capital o
   * destinoExcedente='capital'. Las cuotas parciales/pagadas no se tocan:
   * conservan su historial intacto.
   *
   * Limitación conocida: `pr_prestamos.plazoMeses` sigue mostrando el plazo
   * ORIGINAL del préstamo, no el recalculado — es metadata informativa, no
   * afecta ningún cálculo (la tabla real de pr_cuotas es la fuente de verdad).
   */
  private async aplicarAbonoExtraordinario(
    qr: QueryRunner, empresaId: number, prestamo: any, config: any,
    pendientesOrdenadas: CuotaPendiente[], dist: ResultadoDistribucion,
    montoExtra: number, opcion: 'reducir_cuota' | 'reducir_plazo',
  ): Promise<void> {
    const idsQuedanPagadas = new Set(dist.lineas.filter(l => l.quedaPagada).map(l => l.cuotaId));
    const totalmentePendientes = pendientesOrdenadas.filter(c =>
      !idsQuedanPagadas.has(c.id) && Number(c.capitalPagado) === 0 && Number(c.interesPagado) === 0,
    );
    if (!totalmentePendientes.length) return; // nada que recalcular (p.ej. el extra liquidó lo último que faltaba)

    const saldoCapitalActual = r2(totalmentePendientes.reduce((a, c) => a + (Number(c.capital) - Number(c.capitalPagado)), 0));
    const nuevoSaldoCapital = r2(Math.max(0, saldoCapitalActual - montoExtra));

    if (nuevoSaldoCapital <= 0) {
      await qr.query(
        `UPDATE pr_cuotas SET estado='pagada',"capitalPagado"=capital,"fechaPago"=CURRENT_DATE WHERE id = ANY($1)`,
        [totalmentePendientes.map(c => c.id)],
      );
      return;
    }

    const primeraFechaRestante = totalmentePendientes[0].fechaVencimiento;
    const plazoRestanteActual = totalmentePendientes.length;
    const feriados = config.frecuencia === 'diaria' && config.frecuenciaDiaria?.excluirFeriados
      ? await this.feriadosSvc.obtenerSetFeriados(empresaId, aniosDelPlazo(String(primeraFechaRestante), plazoRestanteActual))
      : undefined;

    let plazoNuevo = plazoRestanteActual;
    if (opcion === 'reducir_plazo') {
      const cuotaActual = Number(totalmentePendientes[0].capital) + Number(totalmentePendientes[0].interes);
      for (let n = 1; n <= plazoRestanteActual; n++) {
        const prueba = calcularTablaAmortizacion(construirParametrosPrestamo(config, {
          montoPrincipal: nuevoSaldoCapital, fechaDesembolso: fechaHoyRD(),
          fechaPrimerPago: String(primeraFechaRestante), plazoPeriodos: n,
        }, feriados));
        plazoNuevo = n;
        if (prueba.cuotaFija != null && prueba.cuotaFija <= cuotaActual) break;
      }
    }

    const resultado = calcularTablaAmortizacion(construirParametrosPrestamo(config, {
      montoPrincipal: nuevoSaldoCapital, fechaDesembolso: fechaHoyRD(),
      fechaPrimerPago: String(primeraFechaRestante), plazoPeriodos: plazoNuevo,
    }, feriados));

    await qr.query(`DELETE FROM pr_cuotas WHERE id = ANY($1)`, [totalmentePendientes.map(c => c.id)]);

    const numeroBase = totalmentePendientes[0].numeroCuota;
    for (let i = 0; i < resultado.tabla.length; i++) {
      const linea = resultado.tabla[i];
      await qr.query(
        `INSERT INTO pr_cuotas ("empresaId","prestamoId","numeroCuota","fechaVencimiento",capital,interes,"cuotaTotal","saldoRestante",cargos,"esPeriodoGracia")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [empresaId, prestamo.id, numeroBase + i, linea.fecha, linea.capital, linea.interes, linea.cuotaTotal, linea.saldoRestante,
         linea.cargos?.length ? JSON.stringify(linea.cargos) : null, linea.esPeriodoGracia],
      );
    }
  }

  async registrar(empresaId: number, data: any) {
    // C1: idempotencia — si esta clave ya generó un pago, devolver ESE en vez
    // de aplicar el dinero de nuevo. Se resuelve ANTES de tocar cuotas/saldos.
    const existente = await this.buscarPorClaveIdempotencia(empresaId, data.claveIdempotencia);
    if (existente) return this.respuestaDePagoExistente(empresaId, existente);

    // C5: el actor sale del CLS (JWT), nunca del body.
    const uid = this.tenantSvc.getUserId();

    let pago: any;
    let numero = '';
    let preparado: Awaited<ReturnType<PagosService['prepararOperacion']>>;

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // H1: FOR UPDATE bloquea préstamo y cuotas hasta el commit — dos pagos
      // simultáneos del mismo préstamo ya no pueden leer los mismos saldos
      // pendientes y aplicar ambos sobre la misma cuota.
      preparado = await this.prepararOperacion(qr, empresaId, data, true);
      const { prestamo, pendientesOrdenadas, dist, montoExtraCapital, config, tipoPago, fecha } = preparado;

      for (const linea of dist.lineas) {
        const cuota = pendientesOrdenadas.find(c => c.id === linea.cuotaId)!;
        const nuevaIntPag    = r2(Number(cuota.interesPagado) + linea.pagInt);
        const nuevaCapPag    = r2(Number(cuota.capitalPagado) + linea.pagCap);
        const nuevaMoraPag   = r2(Number(cuota.moraPagada) + linea.pagMora);
        const nuevaCargosPag = r2(Number(cuota.cargosPagados ?? 0) + linea.pagCargos);
        const nuevaTotal     = r2(Number((cuota as any).totalPagado ?? 0) + linea.totalPagado);
        const estCuota = linea.quedaPagada ? 'pagada' : 'parcial';
        await qr.query(
          `UPDATE pr_cuotas SET "interesPagado"=$1,"capitalPagado"=$2,"moraPagada"=$3,"totalPagado"=$4,
            "cargosPagados"=$5,estado=$6,"fechaPago"=$7 WHERE id=$8`,
          [nuevaIntPag, nuevaCapPag, nuevaMoraPag, nuevaTotal, nuevaCargosPag, estCuota, fecha, cuota.id],
        );
      }

      if (montoExtraCapital > 0) {
        await this.aplicarAbonoExtraordinario(
          qr, empresaId, prestamo, config, pendientesOrdenadas, dist, montoExtraCapital,
          data.abonoExtraordinarioOpcion ?? 'reducir_cuota',
        );
      }

      // Generar número de pago
      const seqRows: any[] = await qr.query(
        `SELECT siguiente_numero_secuencia($1, $2) AS num`, [empresaId, 'PAG'],
      );
      numero = `PAG-${seqRows[0].num}`;

      const aplicadoCapitalTotal = r2(dist.aplicadoCapital + montoExtraCapital);
      const montoPagadoTotal = r2(dist.totalAplicado + montoExtraCapital);

      const pagoRows: any[] = await qr.query(
        `INSERT INTO pr_pagos ("empresaId",numero,"prestamoId","deudorId",fecha,"montoPagado","aplicadoMora",
          "aplicadoInteres","aplicadoCapital","aplicadoCargos","tipoPago","formasPago","montoExtraCapital","metodoPago",referencia,"cobradorId","cobradorNombre",
          "cuotasAfectadas",notas,"creadoPor","claveIdempotencia")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
        [empresaId, numero, data.prestamoId, prestamo.deudorId, fecha, montoPagadoTotal,
         dist.aplicadoMora, dist.aplicadoInteres, aplicadoCapitalTotal, dist.aplicadoCargos,
         tipoPago, data.formasPago?.length ? JSON.stringify(data.formasPago) : null, montoExtraCapital,
         data.metodoPago ?? (data.formasPago?.length ? 'mixto' : null), data.referencia ?? null, uid,
         data.cobradorNombre ?? null, JSON.stringify(dist.lineas), data.notas ?? null, uid,
         data.claveIdempotencia ?? null],
      );
      pago = pagoRows[0];

      // Recalcular saldos del préstamo desde cuotas reales (incluye las que
      // acaba de insertar aplicarAbonoExtraordinario, si corrió)
      const saldos: any[] = await qr.query(
        `SELECT
           SUM(GREATEST(0, capital - "capitalPagado"))                                        AS "saldoCapital",
           SUM(GREATEST(0, interes - "interesPagado"))                                        AS "saldoInteres",
           SUM(GREATEST(0, "moraGenerada" - "moraPagada"))                                    AS "saldoMora",
           COUNT(*) FILTER (WHERE estado <> 'pagada')                                         AS "cuotasPendientes",
           COUNT(*) FILTER (WHERE estado <> 'pagada' AND "fechaVencimiento" < CURRENT_DATE)   AS "cuotasVencidas",
           MAX("diasMora") FILTER (WHERE estado <> 'pagada')                                  AS "maxDiasMora"
         FROM pr_cuotas WHERE "prestamoId"=$1`,
        [data.prestamoId],
      );
      const s = saldos[0];
      const saldoCapital  = r2(Number(s.saldoCapital  ?? 0));
      const saldoInteres  = r2(Number(s.saldoInteres  ?? 0));
      const saldoMora     = r2(Number(s.saldoMora     ?? 0));
      const saldoTotal    = r2(saldoCapital + saldoInteres + saldoMora);
      const cuotasVencidas   = Number(s.cuotasVencidas   ?? 0);
      const cuotasPendientes = Number(s.cuotasPendientes ?? 0);
      const maxDiasMora      = Number(s.maxDiasMora      ?? 0);

      const nuevoEstado = (saldoCapital <= 0 && cuotasPendientes === 0)
        ? 'pagado'
        : clasificarMorosidad(cuotasVencidas, maxDiasMora, Number(prestamo.diasGracia ?? 0));
      const totalPagado = r2(Number(prestamo.totalPagado) + montoPagadoTotal);

      await qr.query(
        `UPDATE pr_prestamos SET "saldoCapital"=$1,"saldoInteres"=$2,"saldoMora"=$3,"saldoTotal"=$4,
          "totalPagado"=$5,"cuotasVencidas"=$6,estado=$7,"updatedAt"=NOW() WHERE id=$8`,
        [saldoCapital, saldoInteres, saldoMora, saldoTotal, totalPagado, cuotasVencidas, nuevoEstado, data.prestamoId],
      );

      if (nuevoEstado === 'pagado') {
        await qr.query(
          `UPDATE pr_deudores SET "totalPagado"="totalPagado"+$1,"prestamosActivos"=GREATEST(0,"prestamosActivos"-1),
            "updatedAt"=NOW() WHERE id=$2 AND "empresaId"=$3`,
          [montoPagadoTotal, prestamo.deudorId, empresaId],
        );
      } else {
        await qr.query(
          `UPDATE pr_deudores SET "totalPagado"="totalPagado"+$1,"updatedAt"=NOW() WHERE id=$2 AND "empresaId"=$3`,
          [montoPagadoTotal, prestamo.deudorId, empresaId],
        );
      }

      await qr.commitTransaction();

      // Guardar saldos finales para el return de abajo (fuera del try)
      (preparado as any)._saldosFinales = { saldoCapital, saldoInteres, saldoMora, saldoTotal };
    } catch (e: any) {
      await qr.rollbackTransaction();
      // Carrera de idempotencia: dos peticiones con la misma clave llegaron
      // casi al mismo tiempo — devolver la que sí se guardó, no reventar con 500.
      if (data.claveIdempotencia && e?.code === '23505') {
        const ganadora = await this.buscarPorClaveIdempotencia(empresaId, data.claveIdempotencia);
        if (ganadora) return this.respuestaDePagoExistente(empresaId, ganadora);
      }
      throw e;
    } finally {
      await qr.release();
    }

    const { prestamo, dist, montoExtraCapital, _saldosFinales } = preparado as any;
    const aplicadoCapitalTotal = r2(dist.aplicadoCapital + montoExtraCapital);

    // Fire-and-forget DESPUÉS del commit (fuera de la transacción)
    this.asientos.asientoPagoPrestamo(
      pago.id, numero, prestamo.numero,
      data.metodoPago ?? (data.formasPago?.length ? 'mixto' : 'transferencia'),
      aplicadoCapitalTotal, dist.aplicadoInteres, dist.aplicadoMora,
      fechaHoyRD(), uid ?? 0,
      dist.aplicadoCargos,
    ).catch(err => this.logger.error(`Asiento pago ${numero}: ${err.message}`));

    if (dist.aplicadoInteres > 0) {
      this.emitirEcf.execute({
        empresaId,
        documentoOrigenTipo: DocumentoOrigenTipo.PAGO_PRESTAMO,
        documentoOrigenId:   pago.id,
        tipoEcf:             32,
      }).catch(err => this.logger.warn(`ECF interés pago ${numero}: ${err.message}`));
    }

    return { pago, cuotasAfectadas: dist.lineas, saldos: _saldosFinales };
  }

  /**
   * Anulación con reversa — ver docs/prestamista/etapa-2-resto.md §1.
   * Solo el pago más reciente NO anulado de ese préstamo (LIFO: registrar()
   * aplica cada pago sobre el saldo que dejó el anterior, así que anular uno
   * de en medio sin anular los posteriores dejaría cuotas en un estado que
   * no corresponde a ningún momento real del préstamo). Un pago con
   * abono extraordinario (recalculó la tabla futura) no se puede anular
   * automáticamente — se rechaza explícitamente.
   */
  async anular(empresaId: number, pagoId: number, motivo: string, usuario: { id: number; nombre?: string }) {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const [pago] = await qr.query(
        `SELECT * FROM pr_pagos WHERE id=$1 AND "empresaId"=$2 FOR UPDATE`, [pagoId, empresaId],
      );
      if (!pago) throw new NotFoundException(`Pago #${pagoId} no encontrado`);
      if (pago.estado === 'anulado') throw new BadRequestException('Este pago ya está anulado');

      if (Number(pago.montoExtraCapital) > 0) {
        throw new BadRequestException(
          'Este pago incluyó un abono extraordinario que recalculó las cuotas futuras; no se puede anular automáticamente. Contacta soporte.',
        );
      }

      const [masReciente] = await qr.query(
        `SELECT id FROM pr_pagos WHERE "prestamoId"=$1 AND "empresaId"=$2 AND estado='activo'
         ORDER BY fecha DESC, id DESC LIMIT 1`,
        [pago.prestamoId, empresaId],
      );
      if (!masReciente || masReciente.id !== pago.id) {
        throw new BadRequestException(
          'Solo se puede anular el pago más reciente de este préstamo — anula primero los pagos posteriores, en orden',
        );
      }

      // El e-CF (tipo 32, interés) solo bloquea si ya quedó ACEPTADO por
      // DGII — en ese caso se corrige vía Nota de Crédito al 607, no se anula
      // aquí. Si nunca llegó a aceptarse, se cancela junto con el pago.
      const [ecf] = await qr.query(
        `SELECT id, "estadoDGII" FROM ecf WHERE "documentoOrigenTipo"='PAGO_PRESTAMO' AND "documentoOrigenId"=$1
         AND "isActive"=true ORDER BY id DESC LIMIT 1`,
        [pago.id],
      );
      if (ecf?.estadoDGII === 'aceptado') {
        throw new BadRequestException(
          'Este pago generó un e-CF ya aceptado por DGII — no se puede anular; corrígelo vía Nota de Crédito al 607.',
        );
      }

      const cuotasAfectadas: Array<{ cuotaId: number; pagInt: number; pagCap: number; pagMora: number; pagCargos: number; totalPagado: number }> =
        Array.isArray(pago.cuotasAfectadas) ? pago.cuotasAfectadas : JSON.parse(pago.cuotasAfectadas ?? '[]');

      for (const linea of cuotasAfectadas) {
        const [cuota] = await qr.query(`SELECT * FROM pr_cuotas WHERE id=$1 FOR UPDATE`, [linea.cuotaId]);
        if (!cuota) continue; // defensivo — no debería faltar nunca
        const nuevaIntPag    = r2(Number(cuota.interesPagado) - linea.pagInt);
        const nuevaCapPag    = r2(Number(cuota.capitalPagado) - linea.pagCap);
        const nuevaMoraPag   = r2(Number(cuota.moraPagada) - linea.pagMora);
        const nuevaCargosPag = r2(Number(cuota.cargosPagados ?? 0) - linea.pagCargos);
        const nuevaTotal     = r2(Number(cuota.totalPagado ?? 0) - linea.totalPagado);
        const estCuota = nuevaCapPag <= 0 && nuevaIntPag <= 0 && nuevaCargosPag <= 0 ? 'pendiente' : 'parcial';
        await qr.query(
          `UPDATE pr_cuotas SET "interesPagado"=$1,"capitalPagado"=$2,"moraPagada"=$3,"totalPagado"=$4,
            "cargosPagados"=$5,estado=$6,"fechaPago"=CASE WHEN $6='pendiente' THEN NULL ELSE "fechaPago" END
           WHERE id=$7`,
          [Math.max(0, nuevaIntPag), Math.max(0, nuevaCapPag), Math.max(0, nuevaMoraPag), Math.max(0, nuevaTotal),
           Math.max(0, nuevaCargosPag), estCuota, linea.cuotaId],
        );
      }

      // Recalcular saldos — misma query que registrar().
      const [prestamo] = await qr.query(`SELECT * FROM pr_prestamos WHERE id=$1 AND "empresaId"=$2 FOR UPDATE`, [pago.prestamoId, empresaId]);
      const [s] = await qr.query(
        `SELECT
           SUM(GREATEST(0, capital - "capitalPagado"))                                        AS "saldoCapital",
           SUM(GREATEST(0, interes - "interesPagado"))                                        AS "saldoInteres",
           SUM(GREATEST(0, "moraGenerada" - "moraPagada"))                                    AS "saldoMora",
           COUNT(*) FILTER (WHERE estado <> 'pagada')                                         AS "cuotasPendientes",
           COUNT(*) FILTER (WHERE estado <> 'pagada' AND "fechaVencimiento" < CURRENT_DATE)   AS "cuotasVencidas",
           MAX("diasMora") FILTER (WHERE estado <> 'pagada')                                  AS "maxDiasMora"
         FROM pr_cuotas WHERE "prestamoId"=$1`,
        [pago.prestamoId],
      );
      const saldoCapital = r2(Number(s.saldoCapital ?? 0));
      const saldoInteres = r2(Number(s.saldoInteres ?? 0));
      const saldoMora    = r2(Number(s.saldoMora ?? 0));
      const saldoTotal   = r2(saldoCapital + saldoInteres + saldoMora);
      const cuotasVencidas   = Number(s.cuotasVencidas ?? 0);
      const cuotasPendientes = Number(s.cuotasPendientes ?? 0);
      const maxDiasMora      = Number(s.maxDiasMora ?? 0);

      const estabaPagado = prestamo.estado === 'pagado';
      const nuevoEstado = (saldoCapital <= 0 && cuotasPendientes === 0)
        ? 'pagado'
        : clasificarMorosidad(cuotasVencidas, maxDiasMora, Number(prestamo.diasGracia ?? 0));
      const totalPagado = r2(Math.max(0, Number(prestamo.totalPagado) - Number(pago.montoPagado)));

      await qr.query(
        `UPDATE pr_prestamos SET "saldoCapital"=$1,"saldoInteres"=$2,"saldoMora"=$3,"saldoTotal"=$4,
          "totalPagado"=$5,"cuotasVencidas"=$6,estado=$7,"updatedAt"=NOW() WHERE id=$8`,
        [saldoCapital, saldoInteres, saldoMora, saldoTotal, totalPagado, cuotasVencidas, nuevoEstado, pago.prestamoId],
      );

      if (estabaPagado && nuevoEstado !== 'pagado') {
        await qr.query(
          `UPDATE pr_deudores SET "totalPagado"=GREATEST(0,"totalPagado"-$1),"prestamosActivos"="prestamosActivos"+1,
            "updatedAt"=NOW() WHERE id=$2 AND "empresaId"=$3`,
          [Number(pago.montoPagado), pago.deudorId, empresaId],
        );
      } else {
        await qr.query(
          `UPDATE pr_deudores SET "totalPagado"=GREATEST(0,"totalPagado"-$1),"updatedAt"=NOW() WHERE id=$2 AND "empresaId"=$3`,
          [Number(pago.montoPagado), pago.deudorId, empresaId],
        );
      }

      if (ecf) {
        await qr.query(`UPDATE ecf SET "isActive"=false WHERE id=$1`, [ecf.id]);
      }

      const [pagoAnulado] = await qr.query(
        `UPDATE pr_pagos SET estado='anulado', "anuladoPor"=$1, "anuladoPorNombre"=$2, "anuladoEn"=NOW(), "motivoAnulacion"=$3
         WHERE id=$4 RETURNING *`,
        [usuario.id, usuario.nombre ?? null, motivo, pago.id],
      );

      await qr.commitTransaction();

      // Fire-and-forget DESPUÉS del commit — mismo patrón que registrar().
      this.asientos.revertirAsiento(
        TipoOrigenAsiento.PRESTAMISTA, pago.id, fechaHoyRD(), motivo, pago.numero,
      ).catch(err => this.logger.error(`Reversa asiento pago ${pago.numero}: ${err.message}`));

      return { pago: pagoAnulado, saldos: { saldoCapital, saldoInteres, saldoMora, saldoTotal } };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }
}
