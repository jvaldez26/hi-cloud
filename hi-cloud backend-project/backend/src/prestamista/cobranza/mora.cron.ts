import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { calcularMoraCuota, r2 } from '../utils/mora.util';

@Injectable()
export class MoraCronService {
  private readonly logger = new Logger(MoraCronService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async calcularMora() {
    this.logger.log('Calculando mora para préstamos activos...');
    try {
      // Marcar cuotas vencidas con días de mora
      await this.ds.query(`
        UPDATE pr_cuotas SET "diasMora" = GREATEST(0, CURRENT_DATE - "fechaVencimiento")
        WHERE estado NOT IN ('pagada','refinanciada')
        AND "fechaVencimiento" < CURRENT_DATE
      `);

      // Obtener préstamos activos con configuración de mora
      const prestamos = await this.ds.query<any[]>(`
        SELECT p.id, p."empresaId", p."porcentajeMora", p."diasGracia", p."saldoCapital", p."saldoMora"
        FROM pr_prestamos p
        WHERE p.estado NOT IN ('pagado','cancelado','refinanciado')
        AND p."porcentajeMora" > 0
      `);

      for (const p of prestamos) {
        // Cuotas vencidas que superaron días de gracia
        const cuotasVencidas = await this.ds.query<any[]>(`
          SELECT id, capital, interes, "capitalPagado", "interesPagado", "diasMora", "moraGenerada"
          FROM pr_cuotas
          WHERE "prestamoId"=$1
          AND estado NOT IN ('pagada','refinanciada')
          AND "diasMora" > $2
        `, [p.id, p.diasGracia ?? 0]);

        for (const cuota of cuotasVencidas) {
          const saldoCap  = Math.max(0, Number(cuota.capital)  - Number(cuota.capitalPagado));
          const saldoInt  = Math.max(0, Number(cuota.interes)  - Number(cuota.interesPagado));
          const saldoBase = r2(saldoCap + saldoInt);

          // C3: la tasa diaria NO se redondea — solo el monto final. Redondearla
          // antes hacía que toda tasa < ~15 %/mes generara 0 de mora.
          const moraCalculada = calcularMoraCuota(saldoBase, p.porcentajeMora, cuota.diasMora);
          const moraActual    = Number(cuota.moraGenerada) || 0;

          // La mora generada solo crece: nunca se rebaja lo ya devengado.
          if (moraCalculada > moraActual) {
            await this.ds.query(
              `UPDATE pr_cuotas SET "moraGenerada"=$1 WHERE id=$2`, [moraCalculada, cuota.id],
            );
          }
        }

        // Actualizar saldo mora y días mora del préstamo.
        // C4: el saldo se lee de las cuotas ya actualizadas y NETO de lo cobrado
        // — misma definición que usa el registro de pagos. Antes se acumulaba en
        // memoria la mora BRUTA, así que el cron de medianoche pisaba el saldo
        // que el pago había dejado bien y la mora cobrada reaparecía.
        const [resumen] = await this.ds.query<any[]>(`
          SELECT
            COUNT(*) FILTER (WHERE estado NOT IN ('pagada','refinanciada') AND "fechaVencimiento" < CURRENT_DATE) AS cuotasVencidas,
            MAX("diasMora") FILTER (WHERE estado NOT IN ('pagada','refinanciada')) AS maxDiasMora,
            SUM(GREATEST(0, capital - "capitalPagado")) AS saldoCap,
            SUM(GREATEST(0, "moraGenerada" - "moraPagada")) AS "saldoMoraNeto"
          FROM pr_cuotas WHERE "prestamoId"=$1
        `, [p.id]);

        const cuotasVencCount = Number(resumen.cuotasVencidas ?? 0);
        const maxDias = Number(resumen.maxDiasMora ?? 0);
        const saldoCapActual = Number(resumen.saldoCap ?? 0);
        const saldoMoraNeto  = r2(Number(resumen.saldoMoraNeto ?? 0));
        const nuevoEstado = saldoCapActual <= 0 ? 'pagado'
          : cuotasVencCount > 0 && maxDias > (p.diasGracia ?? 0) ? 'moroso' : 'al_dia';

        await this.ds.query(`
          UPDATE pr_prestamos SET
            "saldoMora"=$1,"diasMoraActual"=$2,"cuotasVencidas"=$3,estado=$4,"updatedAt"=NOW()
          WHERE id=$5
        `, [saldoMoraNeto, maxDias, cuotasVencCount, nuevoEstado, p.id]);
      }

      this.logger.log(`Mora calculada para ${prestamos.length} préstamos`);
    } catch (err) {
      this.logger.error('Error calculando mora:', err);
    }
  }
}
