import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ed_matriculas.becaId y ed_matriculas.descuentoBeca son campos informativos
 * que ningún código escribe ni consulta para calcular nada — matriculas.
 * service.ts solo los pasaba de largo (INSERT/UPDATE) y los mostraba en la
 * tabla. ed_estudiante_becas + ed_becas es la fuente real: colegiatura.
 * service.ts la consulta (vía BecasService.becasAplicables()) para aplicar
 * el descuento a los cargos de colegiatura/inscripción — ver
 * src/educativo/becas/. Dejar becaId/descuentoBeca declarados invita a que
 * alguien los use pensando que hacen algo, y crea una segunda fuente de
 * verdad desconectada de la real.
 *
 * 0 filas en producción con el módulo educativo contratado — migración
 * limpia, sin datos que perder ni migrar (mismo caso que
 * DropMontoDuplicadoEdCargos).
 */
export class DropBecaFieldsDeEdMatriculas1763400000000 implements MigrationInterface {
  name = 'DropBecaFieldsDeEdMatriculas1763400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`ALTER TABLE ed_matriculas DROP COLUMN IF EXISTS "becaId"`);
    await queryRunner.query(`ALTER TABLE ed_matriculas DROP COLUMN IF EXISTS "descuentoBeca"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`ALTER TABLE ed_matriculas ADD COLUMN IF NOT EXISTS "becaId" INTEGER`);
    await queryRunner.query(`ALTER TABLE ed_matriculas ADD COLUMN IF NOT EXISTS "descuentoBeca" DECIMAL(12,2) NOT NULL DEFAULT 0`);
  }
}
