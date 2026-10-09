import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { r2 } from '../utils/mora.util';
import { calcularTablaAmortizacion } from '../motor/amortizacion-v2.util';
import { resolverMotorConfig, aplicarOverridesSolicitud, construirParametrosPrestamo, aniosDelPlazo } from '../motor/motor-adaptador.util';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';
import { TenantService } from '../../tenant/tenant.service';
import { AsientosAutomaticosService } from '../../contabilidad/services/asientos-automaticos.service';
import { FeriadosService } from '../feriados/feriados.service';

@Injectable()
export class RefinanciamientoService {
  private readonly logger = new Logger(RefinanciamientoService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
    private readonly asientos: AsientosAutomaticosService,
    private readonly feriadosSvc: FeriadosService,
  ) {}

  async findByPrestamo(empresaId: number, prestamoId: number) {
    return this.ds.query(
      `SELECT * FROM pr_refinanciamientos WHERE "prestamoOriginalId"=$1 AND "empresaId"=$2`,
      [prestamoId, empresaId],
    );
  }

  /**
   * H2 — Refinanciamiento.
   *
   * Cierra el préstamo original, marca sus cuotas, crea el préstamo nuevo con
   * todas sus cuotas y registra el refinanciamiento: 6+ escrituras que antes
   * iban sueltas. Un fallo a mitad dejaba el original cerrado y al deudor sin
   * préstamo nuevo — es decir, deuda desaparecida. Ahora es todo o nada.
   *
   * Motor v2 (Fase 2B): el préstamo nuevo siempre se crea con el motor v2,
   * usando la configuración del préstamo original (`original.motorConfig`
   * si es 'v2', o un equivalente sintetizado si es 'v1') con los ajustes que
   * se pidan al refinanciar (tasa/plazo/frecuencia/método).
   */
  async refinanciar(empresaId: number, data: any) {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const res = await this.refinanciarEnTransaccion(qr, empresaId, data);
      await qr.commitTransaction();
      return res;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async refinanciarEnTransaccion(qr: QueryRunner, empresaId: number, data: any) {
    const [original] = await qr.query(
      `SELECT * FROM pr_prestamos WHERE id=$1 AND "empresaId"=$2 FOR UPDATE`, [data.prestamoOriginalId, empresaId],
    );
    if (!original) throw new NotFoundException(`Préstamo #${data.prestamoOriginalId} no encontrado`);
    if (original.estado === 'pagado' || original.estado === 'cancelado') {
      throw new BadRequestException('No se puede refinanciar un préstamo pagado o cancelado');
    }
    // M4: un préstamo ya refinanciado está cerrado y sustituido por el nuevo.
    // Volver a refinanciarlo duplicaba la deuda: generaba un segundo préstamo
    // desde saldos que ya habían sido trasladados.
    if (original.estado === 'refinanciado') {
      throw new BadRequestException(
        'Este préstamo ya fue refinanciado. Refinancia el préstamo nuevo que lo sustituyó.',
      );
    }

    // C5: quien autoriza la condonación/refinanciación sale del CLS (JWT), no del body.
    const uid = this.tenantSvc.getUserId();

    const saldoCapital = r2(Number(original.saldoCapital ?? 0));
    const saldoInteres = r2(Number(original.saldoInteres ?? 0));
    const saldoMora    = r2(Number(original.saldoMora ?? 0));
    const moraCondonada    = r2(Number(data.moraCondonada    ?? 0));
    const interesCondonado = r2(Number(data.interesCondonado ?? 0));

    const montoNuevo = data.montoNuevo
      ? r2(Number(data.montoNuevo))
      : r2(saldoCapital + (saldoInteres - interesCondonado) + (saldoMora - moraCondonada));

    // Cerrar préstamo original
    await qr.query(
      `UPDATE pr_prestamos SET estado='refinanciado',"updatedAt"=NOW() WHERE id=$1 AND "empresaId"=$2`,
      [original.id, empresaId],
    );
    await qr.query(
      `UPDATE pr_cuotas SET estado='refinanciada' WHERE "prestamoId"=$1 AND estado<>'pagada'`,
      [original.id],
    );

    // Config del motor: la del préstamo original (o un equivalente
    // sintetizado si es 'v1' — motorConfigLegacyDesdeProducto() funciona
    // igual sobre un préstamo que sobre un producto: mismos nombres de
    // columna) + los ajustes que se pidan al refinanciar.
    let config = resolverMotorConfig(original);
    config = aplicarOverridesSolicitud(config, {
      tasaInteresMensual: data.nuevaTasa,
      frecuencia: data.nuevaFrecuencia,
      metodo: data.nuevoMetodo,
    });

    const nuevoPlazo = data.nuevoPlazo ?? Number(original.plazoMeses);
    const fechaDesembolso = fechaHoyRD();
    const fechaPrimerPago = data.fechaPrimerPago ?? fechaHoyRD();

    const feriados = config.frecuencia === 'diaria' && config.frecuenciaDiaria?.excluirFeriados
      ? await this.feriadosSvc.obtenerSetFeriados(empresaId, aniosDelPlazo(fechaDesembolso, Number(nuevoPlazo)))
      : undefined;

    const resultado = calcularTablaAmortizacion(construirParametrosPrestamo(config, {
      montoPrincipal: montoNuevo,
      fechaDesembolso,
      fechaPrimerPago,
      plazoPeriodos: Number(nuevoPlazo),
    }, feriados));

    const [seq] = await qr.query(
      `SELECT siguiente_numero_secuencia($1, $2) AS num`, [empresaId, 'PRE'],
    );
    const numero = `PRE-${seq.num}`;

    const ultimaCuota = resultado.tabla[resultado.tabla.length - 1];
    const [nuevo] = await qr.query(
      `INSERT INTO pr_prestamos ("empresaId",numero,"deudorId","productoId","montoPrincipal",
        "tasaInteresMensual","plazoMeses","frecuenciaPago","metodoAmortizacion","cuotaPeriodica",
        "porcentajeMora","diasGracia","fechaDesembolso","fechaPrimerPago","fechaVencimiento",
        "totalInteres","totalAPagar","saldoCapital","saldoInteres","saldoTotal","refinanciaDe",
        "motorVersion","motorConfig")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
      [empresaId, numero, original.deudorId, original.productoId ?? null, resultado.montoPrincipalFinanciado,
       config.tasa.valor * 100, nuevoPlazo, config.frecuencia, config.metodo, resultado.cuotaFija,
       config.mora?.tasaOMonto ?? Number(original.porcentajeMora), config.gracia?.periodos ?? Number(original.diasGracia),
       fechaDesembolso,
       fechaPrimerPago,
       ultimaCuota.fecha,
       resultado.totalInteres, resultado.totalAPagar, resultado.montoPrincipalFinanciado, resultado.totalInteres, resultado.totalAPagar,
       original.id,
       'v2', JSON.stringify(config)],
    );

    for (const linea of resultado.tabla) {
      await qr.query(
        `INSERT INTO pr_cuotas ("empresaId","prestamoId","numeroCuota","fechaVencimiento",capital,interes,"cuotaTotal","saldoRestante",cargos,"esPeriodoGracia")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [empresaId, nuevo.id, linea.numeroCuota, linea.fecha,
         linea.capital, linea.interes, linea.cuotaTotal, linea.saldoRestante,
         linea.cargos?.length ? JSON.stringify(linea.cargos) : null, linea.esPeriodoGracia],
      );
    }

    // Registrar refinanciamiento
    const [ref] = await qr.query(
      `INSERT INTO pr_refinanciamientos ("empresaId","prestamoOriginalId","prestamoNuevoId","deudorId",
        "saldoCapitalOriginal","saldoInteresOriginal","saldoMoraOriginal","saldoTotalOriginal",
        "montoNuevo","nuevaTasa","nuevoPlazo","moraCondonada","interesCondonado","autorizadoPor",motivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [empresaId, original.id, nuevo.id, original.deudorId,
       saldoCapital, saldoInteres, saldoMora, r2(saldoCapital + saldoInteres + saldoMora),
       resultado.montoPrincipalFinanciado, config.tasa.valor * 100, nuevoPlazo, moraCondonada, interesCondonado,
       uid != null ? String(uid) : null, data.motivo ?? null],
    );

    // C6: asiento DENTRO de la misma transacción — si falla (cuenta
    // faltante, asiento descuadrado), se revierte TODO el refinanciamiento.
    // Antes esto no generaba ningún asiento: la condonación de mora/interés
    // (una pérdida real) y la reversa de cartera del original nunca
    // llegaban a los libros.
    await this.asientos.asientoRefinanciamiento(
      {
        prestamoNuevoId:      nuevo.id,
        numeroOriginal:       original.numero,
        numeroNuevo:          numero,
        saldoCapitalOriginal: saldoCapital,
        saldoInteresOriginal: saldoInteres,
        saldoMoraOriginal:    saldoMora,
        moraCondonada,
        interesCondonado,
        montoNuevo: resultado.montoPrincipalFinanciado,
        fecha:                fechaHoyRD(),
        userId:               uid ?? 0,
      },
      qr.manager,
    );

    return { refinanciamiento: ref, prestamoNuevo: nuevo };
  }
}
