import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { fechaHoyRD, diferenciaDiasRD } from '../../common/utils/fecha-local.util';
import { redondearMoneda } from '../../common/utils/moneda.util';

/**
 * Mora diaria de ed_cargos. Decisiones (no reabrir sin hablarlo primero):
 *
 * - Se RECALCULA completa cada día, nunca se acumula sumando — así correr
 *   el cron dos veces el mismo día no duplica nada. Lo único que crece día
 *   a día es diasMora (los días de calendario en mora crecen solos); el
 *   monto de la mora puede incluso bajar de un día a otro si hubo un abono
 *   parcial mientras tanto.
 * - La mora NUNCA se cobra sobre la mora: la base siempre es
 *   montoOriginal - descuento (nunca montoTotal, que ya incluye la mora de
 *   ayer). Un abono parcial sí reduce esa base — "sobre el saldo
 *   pendiente, no sobre el original" — restando montoPagado de esa MISMA
 *   base sin mora, nunca del montoTotal con mora adentro.
 * - Un cargo con moraCondonada=true queda afuera del cron para siempre —
 *   condonar no tendría sentido si la mora reaparece al día siguiente.
 * - Solo cargos ligados a un plan (planPagoId) acumulan mora de verdad —
 *   diasGracia/cargoMoraPct viven en ed_planes_pago. Un cargo de
 *   transporte/comedor (sin plan) sí pasa a estado 'vencido' si corresponde
 *   (es un hecho, no depende de configuración), pero nunca genera
 *   montoMora — no hay tasa que aplicarle.
 *
 * Solo procesa empresas con el add-on 'educativo' activo — misma query
 * exacta que ModuloAddonGuard, ver modulo-addon.guard.ts.
 */
@Injectable()
export class MoraCronService {
  private readonly logger = new Logger(MoraCronService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // 5:00 UTC = 1:00 a.m. en RD (UTC-4) — corre ya entrado el nuevo día RD,
  // después de medianoche, para que fechaHoyRD() sea el día que corresponde.
  @Cron('0 5 * * *')
  async calcularMora() {
    const hoy = fechaHoyRD();
    this.logger.log(`Calculando mora de ed_cargos — hoy RD = ${hoy}`);

    let empresas: any[];
    try {
      empresas = await this.ds.query<any[]>(
        `SELECT DISTINCT "empresaId" FROM empresa_modulos
         WHERE "moduloCodigo" = 'educativo' AND activo = true
           AND ("fechaVencimiento" IS NULL OR "fechaVencimiento" > NOW())`,
      );
    } catch (err: any) {
      this.logger.error(`Error listando empresas con add-on educativo: ${err.message}`, err.stack);
      return;
    }

    let totalCargos = 0;
    for (const { empresaId } of empresas) {
      try {
        totalCargos += await this.procesarEmpresa(empresaId, hoy);
      } catch (err: any) {
        // Una empresa con un dato raro no debe tumbar el cron para el resto.
        this.logger.error(`Error calculando mora — empresa #${empresaId}: ${err.message}`, err.stack);
      }
    }
    this.logger.log(`Mora recalculada: ${empresas.length} empresa(s), ${totalCargos} cargo(s)`);
  }

  private async procesarEmpresa(empresaId: number, hoy: string): Promise<number> {
    const candidatos = await this.ds.query<any[]>(
      `SELECT id, "planPagoId" FROM ed_cargos
       WHERE "empresaId" = $1 AND estado IN ('pendiente', 'parcial', 'vencido')
         AND "moraCondonada" = false
         AND "fechaVencimiento" IS NOT NULL AND "fechaVencimiento" < $2`,
      [empresaId, hoy],
    );
    if (!candidatos.length) return 0;

    const planIds = [...new Set(candidatos.map((c: any) => c.planPagoId).filter(Boolean))];
    const planes = planIds.length
      ? await this.ds.query<any[]>(
          `SELECT id, "diasGracia", "cargoMoraPct" FROM ed_planes_pago WHERE id = ANY($1)`,
          [planIds],
        )
      : [];
    const planPorId = new Map(planes.map((p: any) => [p.id, p]));

    let procesados = 0;
    for (const candidato of candidatos) {
      const tocado = await this.recalcularCargo(empresaId, candidato.id, planPorId);
      if (tocado) procesados++;
    }
    return procesados;
  }

  /**
   * Lock pesimista sobre el cargo — si un pago concurrente está en curso
   * sobre el mismo cargo (mismo FOR UPDATE que registrarPago()), uno de los
   * dos espera al otro en vez de pisarlo. Vuelve a comprobar estado y
   * moraCondonada bajo el lock: pudieron cambiar entre el SELECT de
   * candidatos y este punto.
   */
  private async recalcularCargo(empresaId: number, cargoId: number, planPorId: Map<number, any>): Promise<boolean> {
    return this.ds.transaction(async (manager) => {
      const [fila] = await manager.query<any[]>(
        `SELECT * FROM ed_cargos WHERE id = $1 AND "empresaId" = $2 FOR UPDATE`,
        [cargoId, empresaId],
      );
      if (!fila) return false;
      if (fila.estado === 'pagado' || fila.estado === 'anulado' || fila.moraCondonada) return false;

      const plan = fila.planPagoId ? planPorId.get(fila.planPagoId) : null;
      const diasGracia = Number(plan?.diasGracia ?? 0);
      const cargoMoraPct = Number(plan?.cargoMoraPct ?? 0);

      // fila.fechaVencimiento vuelve del driver como Date de JS (medianoche
      // UTC del día guardado) o como string según la query — diferenciaDiasRD
      // maneja ambos casos sin el bug de restar Dates directo (ver su doc).
      const diasVencido = diferenciaDiasRD(fila.fechaVencimiento);
      const diasMora = Math.max(diasVencido - diasGracia, 0);

      // Base SIN mora — nunca montoTotal, que ya trae la mora de ayer adentro.
      const baseSinMora = Number(fila.montoOriginal ?? 0) - Number(fila.descuento ?? 0);
      const saldoSinMora = Math.max(baseSinMora - Number(fila.montoPagado ?? 0), 0);
      const montoMora = diasMora > 0 ? redondearMoneda(saldoSinMora * (cargoMoraPct / 100)) : 0;

      // montoTotal y saldoPendiente son derivados y se escriben juntos —
      // mismo punto único de escritura que registrarPago()/updateCargo().
      const montoTotal = redondearMoneda(baseSinMora + montoMora);
      const saldoPendiente = Math.max(redondearMoneda(montoTotal - Number(fila.montoPagado ?? 0)), 0);
      const nuevoEstado = saldoPendiente <= 0 ? 'pagado' : 'vencido';

      await manager.query(
        `UPDATE ed_cargos
           SET "montoMora" = $1, "diasMora" = $2, "montoTotal" = $3, "saldoPendiente" = $4, estado = $5
         WHERE id = $6 AND "empresaId" = $7`,
        [montoMora, diasMora, montoTotal, saldoPendiente, nuevoEstado, cargoId, empresaId],
      );
      return true;
    });
  }
}
