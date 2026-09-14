import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El UNIQUE real de ed_asistencia es ("estudianteId", fecha, "asignaturaId"),
 * pero bulkAsistencia() (asistencia general del día, sin materia — el caso
 * más común de un colegio) nunca manda asignaturaId: queda NULL en cada
 * fila. Postgres nunca considera dos NULL iguales para un UNIQUE, así que
 * ese UNIQUE no protege el caso que en verdad importa — reenviar la
 * asistencia del mismo día duplica filas en vez de actualizar (confirmado
 * en vivo probando el flujo completo del módulo, 2026-09-14).
 *
 * Este índice único parcial cubre exactamente ese caso: una fila por
 * estudiante+fecha cuando la asistencia es general (asignaturaId IS NULL).
 * El UNIQUE original sigue intacto y sigue cubriendo la asistencia por
 * materia (asignaturaId IS NOT NULL) — son dos casos, dos constraints.
 */
export class AsistenciaGeneralUnicaPorDia1763200000000 implements MigrationInterface {
  name = 'AsistenciaGeneralUnicaPorDia1763200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ed_asistencia_general_por_dia
      ON ed_asistencia ("estudianteId", fecha)
      WHERE "asignaturaId" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`DROP INDEX IF EXISTS uq_ed_asistencia_general_por_dia`);
  }
}
