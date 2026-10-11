import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { r2 } from '../utils/mora.util';
import { calcularTablaAmortizacion } from '../motor/amortizacion-v2.util';
import { resolverMotorConfig, aplicarOverridesSolicitud, construirParametrosPrestamo, aniosDelPlazo } from '../motor/motor-adaptador.util';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';
import { FeriadosService } from '../feriados/feriados.service';

/**
 * Reestructuración (Etapa 2 resto, §5) — distinta de
 * RefinanciamientoService.refinanciar(), que SIEMPRE cierra el préstamo y
 * crea uno nuevo. Aquí el préstamo sigue siendo el MISMO (mismo id, mismo
 * historial de pagos): solo se reemplaza el plan de las cuotas totalmente
 * pendientes, con el mismo criterio que PagosService.aplicarAbonoExtraordinario()
 * (nunca toca una cuota con algún pago ya aplicado).
 */
@Injectable()
export class ReestructuracionService {
  private readonly logger = new Logger(ReestructuracionService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly feriadosSvc: FeriadosService,
  ) {}

  async reestructurar(empresaId: number, prestamoId: number, data: any, usuario: { id: number; nombre?: string }) {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const resultado = await this.reestructurarEnTransaccion(qr, empresaId, prestamoId, data, usuario);
      await qr.commitTransaction();
      this.logger.log(`Préstamo #${prestamoId} reestructurado por ${usuario.nombre ?? `usuario #${usuario.id}`} — ${data.motivo}`);
      return resultado;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async reestructurarEnTransaccion(qr: QueryRunner, empresaId: number, prestamoId: number, data: any, usuario: { id: number; nombre?: string }) {
    const [prestamo] = await qr.query(
      `SELECT * FROM pr_prestamos WHERE id=$1 AND "empresaId"=$2 FOR UPDATE`, [prestamoId, empresaId],
    );
    if (!prestamo) throw new NotFoundException(`Préstamo #${prestamoId} no encontrado`);
    if (['cancelado', 'pagado', 'refinanciado'].includes(prestamo.estado)) {
      throw new BadRequestException(`No se puede reestructurar un préstamo en estado "${prestamo.estado}"`);
    }
    if (prestamo.estado === 'desembolso_parcial') {
      throw new BadRequestException('Este préstamo tiene desembolso pendiente — complétalo antes de reestructurar');
    }
    if (prestamo.motorVersion !== 'v2' || !prestamo.motorConfig) {
      throw new BadRequestException('Solo los préstamos del motor v2 pueden reestructurarse');
    }

    const pendientesOrdenadas: any[] = await qr.query(
      `SELECT * FROM pr_cuotas WHERE "prestamoId"=$1 AND estado<>'pagada' ORDER BY "numeroCuota" FOR UPDATE`,
      [prestamoId],
    );
    const totalmentePendientes = pendientesOrdenadas.filter(c =>
      Number(c.capitalPagado) === 0 && Number(c.interesPagado) === 0,
    );
    if (!totalmentePendientes.length) {
      throw new BadRequestException('No hay cuotas totalmente pendientes para reestructurar — todas tienen algún pago aplicado');
    }

    const saldoCapitalActual = r2(totalmentePendientes.reduce((a, c) => a + (Number(c.capital) - Number(c.capitalPagado)), 0));

    let config = resolverMotorConfig(prestamo);
    config = aplicarOverridesSolicitud(config, {
      tasaInteresMensual: data.nuevaTasaInteresMensual,
      metodo: data.nuevoMetodoAmortizacion,
    });

    const plazoNuevo = data.nuevoPlazoMeses ?? totalmentePendientes.length;
    const primeraFechaRestante = String(totalmentePendientes[0].fechaVencimiento);
    const feriados = config.frecuencia === 'diaria' && config.frecuenciaDiaria?.excluirFeriados
      ? await this.feriadosSvc.obtenerSetFeriados(empresaId, aniosDelPlazo(primeraFechaRestante, Number(plazoNuevo)))
      : undefined;

    const resultado = calcularTablaAmortizacion(construirParametrosPrestamo(config, {
      montoPrincipal: saldoCapitalActual,
      fechaDesembolso: fechaHoyRD(),
      fechaPrimerPago: primeraFechaRestante,
      plazoPeriodos: Number(plazoNuevo),
    }, feriados));

    if (!resultado.tabla.length) {
      throw new BadRequestException('No se pudo recalcular el plan de amortización (plazo inválido)');
    }

    await qr.query(`DELETE FROM pr_cuotas WHERE id = ANY($1)`, [totalmentePendientes.map(c => c.id)]);

    const numeroBase = totalmentePendientes[0].numeroCuota;
    for (let i = 0; i < resultado.tabla.length; i++) {
      const linea = resultado.tabla[i];
      await qr.query(
        `INSERT INTO pr_cuotas ("empresaId","prestamoId","numeroCuota","fechaVencimiento",capital,interes,"cuotaTotal","saldoRestante",cargos,"esPeriodoGracia")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [empresaId, prestamoId, numeroBase + i, linea.fecha, linea.capital, linea.interes, linea.cuotaTotal, linea.saldoRestante,
         linea.cargos?.length ? JSON.stringify(linea.cargos) : null, linea.esPeriodoGracia],
      );
    }

    const ultimaCuotaNueva = resultado.tabla[resultado.tabla.length - 1];
    // plazoMeses es metadata informativa (igual advertencia que
    // aplicarAbonoExtraordinario()) — nunca la fuente de verdad, que es
    // pr_cuotas: el total real de cuotas tras el reemplazo.
    const [{ total: plazoMesesInformativo }] = await qr.query(
      `SELECT COUNT(*)::int AS total FROM pr_cuotas WHERE "prestamoId"=$1`, [prestamoId],
    );

    // query() con UPDATE/DELETE devuelve [filas, rowCount] (TypeORM +
    // PostgresQueryRunner), nunca la fila sola — envolver en CTE para que
    // SÍ devuelva filas planas (ver scripts/validate-update-returning.js).
    const [actualizado] = await qr.query(
      `WITH fila AS (
         UPDATE pr_prestamos SET "tasaInteresMensual"=$1,"metodoAmortizacion"=$2,"cuotaPeriodica"=$3,
           "plazoMeses"=$4,"fechaVencimiento"=$5,"motorConfig"=$6,
           notas=CONCAT(COALESCE(notas,''), ' | Reestructurado: ', $7), "updatedAt"=NOW()
         WHERE id=$8 AND "empresaId"=$9 RETURNING *
       ) SELECT * FROM fila`,
      [config.tasa.valor * 100, config.metodo, resultado.cuotaFija,
       plazoMesesInformativo, ultimaCuotaNueva.fecha, JSON.stringify(config),
       data.motivo, prestamoId, empresaId],
    );

    return {
      prestamo: actualizado,
      cuotasReemplazadas: totalmentePendientes.length,
      cuotasNuevas: resultado.tabla.length,
    };
  }
}
