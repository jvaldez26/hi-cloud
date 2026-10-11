import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prestamista Etapa 3 — Cobranza (ver docs/prestamista/etapa-3-cobranza.md).
 *
 * pr_prestamos.cobradorId/cobradorNombre: asignación PERSISTENTE de cartera a
 * un cobrador — distinta de oficialId/oficialNombre (quien originó el
 * préstamo, nunca cambia) y de pr_cobranzas.cobradorId (snapshot de quién
 * hizo CADA gestión puntual, ya existía). Un préstamo puede reasignarse de
 * cobrador muchas veces en su vida; cada gestión igual queda con su propio
 * snapshot histórico en pr_cobranzas, que no se toca al reasignar.
 */
export class PrestamistaCobranzaEtapa31780000000000 implements MigrationInterface {
  name = 'PrestamistaCobranzaEtapa31780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE pr_prestamos
        ADD COLUMN IF NOT EXISTS "cobradorId" INTEGER NULL,
        ADD COLUMN IF NOT EXISTS "cobradorNombre" VARCHAR(200) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pr_prestamos_cobrador ON pr_prestamos("cobradorId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_pr_prestamos_cobrador`);
    await queryRunner.query(`
      ALTER TABLE pr_prestamos
        DROP COLUMN IF EXISTS "cobradorNombre",
        DROP COLUMN IF EXISTS "cobradorId"
    `);
  }
}
