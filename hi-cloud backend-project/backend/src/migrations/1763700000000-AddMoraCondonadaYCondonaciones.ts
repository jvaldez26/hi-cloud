import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soporte para el cron de mora de ed_cargos:
 *   - "moraCondonada": flag en el propio cargo — una vez condonada la mora,
 *     el cron deja de recalcularla para ese cargo (si no, reaparecería al
 *     día siguiente y la condonación no serviría de nada).
 *   - ed_cargos_condonaciones: el registro auditable de CADA condonación
 *     (monto perdonado, motivo obligatorio, quién y cuándo) — separado del
 *     audit_log genérico porque este necesita ser consultable POR CARGO
 *     para mostrarse en el desglose (mismo espíritu que
 *     ed_cargos.concepto para becas/planes, pero esto sí necesita su
 *     propia tabla: hay que guardar motivo en texto libre y usuarioId,
 *     que no caben en un campo de 200 caracteres).
 */
export class AddMoraCondonadaYCondonaciones1763700000000 implements MigrationInterface {
  name = 'AddMoraCondonadaYCondonaciones1763700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE ed_cargos
        ADD COLUMN IF NOT EXISTS "moraCondonada" BOOLEAN DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ed_cargos_condonaciones (
        id                SERIAL PRIMARY KEY,
        "empresaId"       INTEGER NOT NULL,
        "cargoId"         INTEGER NOT NULL REFERENCES ed_cargos(id) ON DELETE CASCADE,
        "montoCondonado"  DECIMAL(12,2) NOT NULL,
        motivo            TEXT NOT NULL,
        "usuarioId"       INTEGER,
        "createdAt"       TIMESTAMP DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP TABLE IF EXISTS ed_cargos_condonaciones`);
    await queryRunner.query(`ALTER TABLE ed_cargos DROP COLUMN IF EXISTS "moraCondonada"`);
  }
}
