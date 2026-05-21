import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea tabla de auditoría pos_supervisor_log para el modo supervisor del POS.
 * La configuración del modo supervisor se guarda en empresa.configuracion (JSONB).
 */
export class PosSupervisorLog1748800000000 implements MigrationInterface {
  name = 'PosSupervisorLog1748800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pos_supervisor_log (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "cajeroId"       INTEGER,
        "supervisorId"   INTEGER NOT NULL,
        "supervisorNombre" VARCHAR(200),
        action           VARCHAR(100) NOT NULL DEFAULT 'SUPERVISOR_LOGIN',
        detail           TEXT,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pos_sup_log_empresa"
        ON pos_supervisor_log ("empresaId", "createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS pos_supervisor_log`);
  }
}
