import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ed_comunicados soporta destinatarioTipo 'todos'|'grado' (gradoId)|
 * 'seccion' (seccionId) — pero el enunciado de disciplina/biblioteca/
 * transporte/comunicados pide también destinatario "individual", y no
 * hay ninguna columna para guardar A QUIÉN si es individual. Se agrega
 * "estudianteId", nullable, mismo patrón que gradoId/seccionId
 * (ON DELETE SET NULL — si el estudiante se borra, el comunicado ya
 * enviado queda como historial, no se cae con él).
 *
 * Comunicados aún no tiene API ni datos en producción — migración
 * limpia, sin filas que migrar.
 */
export class AddEstudianteIdAEdComunicados1763600000000 implements MigrationInterface {
  name = 'AddEstudianteIdAEdComunicados1763600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE ed_comunicados
        ADD COLUMN IF NOT EXISTS "estudianteId" INTEGER REFERENCES ed_estudiantes(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`ALTER TABLE ed_comunicados DROP COLUMN IF EXISTS "estudianteId"`);
  }
}
