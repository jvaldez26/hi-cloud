import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import * as Sentry from '@sentry/node';

/**
 * Vigilancia semanal de filas huérfanas: empresaId que no existe en `empresa`.
 * Nace de la limpieza manual de huérfanos de 2026-10 (empresa 2, luego
 * 37/1/28/29/39/33) — el proyecto NO tiene FK de empresaId hacia `empresa`
 * (convención deliberada), así que una fila huérfana nunca la rechaza
 * Postgres: solo la encuentra una auditoría explícita como esta.
 *
 * El listado de tablas a revisar sale de information_schema en cada corrida
 * (igual que el diagnóstico manual que encontró los huérfanos), nunca de una
 * lista escrita a mano — así sigue cubriendo tablas nuevas sin que nadie
 * tenga que acordarse de añadirlas aquí.
 *
 * NO excluye contadores_secuencia (empresaId=0): a diferencia de lo que
 * parecía al investigarlo, NO es un centinela/contador global deliberado —
 * es el resultado de un hueco real en contabilidad.service.ts (ver
 * generarNumero(), línea ~1052: `empresaId ?? 0` sin guardia previa) que ya
 * produjo 13 asientos contables huérfanos en producción. Se deja SIN
 * excluir a propósito, para que este cron siga avisando hasta que ese hueco
 * se cierre.
 */
@Injectable()
export class HuerfanosAuditoriaCron {
  private readonly logger = new Logger(HuerfanosAuditoriaCron.name);

  constructor(private ds: DataSource) {}

  @Cron('0 3 * * 0', { timeZone: 'America/Santo_Domingo', name: 'auditoria-huerfanos-empresa' })
  async auditar(): Promise<void> {
    const hallazgos = await this.buscarHuerfanos();
    if (!hallazgos.length) {
      this.logger.log('[Huérfanos] Auditoría semanal: 0 filas huérfanas en todas las tablas revisadas.');
      return;
    }

    for (const h of hallazgos) {
      this.logger.warn(`[Huérfanos] ${h.tabla}: ${h.filas} fila(s) con empresaId inexistente en empresa`);
      Sentry.captureMessage('[Huérfanos] Filas con empresaId que no existe en empresa', {
        level: 'warning',
        tags:  { area: 'integridad-datos', tabla: h.tabla },
        extra: { tabla: h.tabla, filas: h.filas },
      });
    }

    this.logger.warn(
      `[Huérfanos] Auditoría semanal: ${hallazgos.length} tabla(s) con filas huérfanas ` +
      `(${hallazgos.reduce((s, h) => s + h.filas, 0)} fila(s) en total) — revisar Sentry.`,
    );
  }

  /**
   * Expuesto por separado (no solo dentro de `auditar()`) para que el panel
   * de Super Admin pueda mostrar el mismo conteo a pedido, sin esperar al
   * domingo.
   */
  async buscarHuerfanos(): Promise<{ tabla: string; filas: number }[]> {
    const tablas = await this.ds.query<{ table_name: string }[]>(`
      SELECT table_name FROM information_schema.columns
      WHERE column_name = 'empresaId' AND table_schema = 'public'
      ORDER BY table_name
    `);

    const hallazgos: { tabla: string; filas: number }[] = [];
    for (const { table_name } of tablas) {
      try {
        const [{ n }] = await this.ds.query<{ n: number }[]>(`
          SELECT COUNT(*)::int AS n
          FROM "${table_name}" t
          WHERE t."empresaId" IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = t."empresaId")
        `);
        if (n > 0) hallazgos.push({ tabla: table_name, filas: n });
      } catch (err: any) {
        this.logger.warn(`[Huérfanos] No se pudo revisar "${table_name}": ${err.message}`);
      }
    }
    return hallazgos;
  }
}
