import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropVencimientoOverride1754100000000 implements MigrationInterface {
  name = 'DropVencimientoOverride1754100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    // Copia de seguridad antes de DROP (solo empresas que tenían override activo)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bkp_vencimiento_override AS
        SELECT id, "empresaId", "fechaVencimiento", "vencimientoOverride"
        FROM suscripciones
        WHERE "vencimientoOverride" IS NOT NULL
    `);

    // Migrar el valor override → fechaVencimiento (el override pasa a ser la nueva fecha de corte)
    await queryRunner.query(`
      UPDATE suscripciones
      SET "fechaVencimiento" = "vencimientoOverride"
      WHERE "vencimientoOverride" IS NOT NULL
    `);

    // Verificar que no quede ningún override sin migrar antes de eliminar la columna
    const [{ pendientes }] = await queryRunner.query(`
      SELECT COUNT(*) AS pendientes
      FROM suscripciones
      WHERE "vencimientoOverride" IS NOT NULL
        AND "fechaVencimiento" IS DISTINCT FROM "vencimientoOverride"
    `);
    if (Number(pendientes) > 0) {
      throw new Error(
        `DropVencimientoOverride: ${pendientes} fila(s) con override sin migrar. Se hace rollback.`,
      );
    }

    await queryRunner.query(`ALTER TABLE suscripciones DROP COLUMN "vencimientoOverride"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE suscripciones
        ADD COLUMN IF NOT EXISTS "vencimientoOverride" DATE NULL
    `);
  }
}
