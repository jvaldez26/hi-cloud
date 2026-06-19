import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

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

        let saldoMoraNuevo = 0;

        for (const cuota of cuotasVencidas) {
          const saldoCap  = Math.max(0, Number(cuota.capital)  - Number(cuota.capitalPagado));
          const saldoInt  = Math.max(0, Number(cuota.interes)  - Number(cuota.interesPagado));
          const saldoBase = Math.round((saldoCap + saldoInt) * 100) / 100;

          // Mora diaria = tasa mensual / 30
          const moraDiaria = Math.round(Number(p.porcentajeMora) / 30 / 100 * 100) / 100;
          const moraCalculada = Math.round(saldoBase * moraDiaria * Number(cuota.diasMora) * 100) / 100;
          const moraActual = Number(cuota.moraGenerada) || 0;

          if (moraCalculada > moraActual) {
            await this.ds.query(
              `UPDATE pr_cuotas SET "moraGenerada"=$1 WHERE id=$2`, [moraCalculada, cuota.id],
            );
          }

          saldoMoraNuevo += moraCalculada;
        }

        // Actualizar saldo mora y días mora del préstamo
        const [resumen] = await this.ds.query<any[]>(`
          SELECT
            COUNT(*) FILTER (WHERE estado NOT IN ('pagada','refinanciada') AND "fechaVencimiento" < CURRENT_DATE) AS cuotasVencidas,
            MAX("diasMora") FILTER (WHERE estado NOT IN ('pagada','refinanciada')) AS maxDiasMora,
            SUM(GREATEST(0, capital - "capitalPagado")) AS saldoCap
          FROM pr_cuotas WHERE "prestamoId"=$1
        `, [p.id]);

        const cuotasVencCount = Number(resumen.cuotasVencidas ?? 0);
        const maxDias = Number(resumen.maxDiasMora ?? 0);
        const saldoCapActual = Number(resumen.saldoCap ?? 0);
        const nuevoEstado = saldoCapActual <= 0 ? 'pagado'
          : cuotasVencCount > 0 && maxDias > (p.diasGracia ?? 0) ? 'moroso' : 'al_dia';

        await this.ds.query(`
          UPDATE pr_prestamos SET
            "saldoMora"=$1,"diasMoraActual"=$2,"cuotasVencidas"=$3,estado=$4,"updatedAt"=NOW()
          WHERE id=$5
        `, [Math.round(saldoMoraNuevo * 100) / 100, maxDias, cuotasVencCount, nuevoEstado, p.id]);
      }

      this.logger.log(`Mora calculada para ${prestamos.length} préstamos`);
    } catch (err) {
      this.logger.error('Error calculando mora:', err);
    }
  }
}
