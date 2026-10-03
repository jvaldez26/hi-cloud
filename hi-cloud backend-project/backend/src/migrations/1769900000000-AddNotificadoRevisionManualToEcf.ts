import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Flag propio para la sección "Revisión manual (72h)" del resumen horario
 * del super admin (resumen-ecf-pendientes.job.ts) — independiente de
 * notificadoResumen (1769?...): un e-CF suele entrar primero a
 * EN_VALIDACION_DGII y marcarse notificadoResumen=true en ESE resumen, y
 * solo mucho después (72h) cruzar a revisionManual=true. Sin un flag propio
 * nunca volvería a aparecer en ningún resumen posterior.
 *
 * Nombres en camelCase entre comillas — el proyecto no usa NamingStrategy
 * (ver 1761900000000-AddModoEmisionEcf.ts).
 */
export class AddNotificadoRevisionManualToEcf1769900000000 implements MigrationInterface {
  name = 'AddNotificadoRevisionManualToEcf1769900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE "ecf"
        ADD COLUMN IF NOT EXISTS "notificadoRevisionManual" BOOLEAN NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE "ecf"
        DROP COLUMN IF EXISTS "notificadoRevisionManual"
    `);
  }
}
