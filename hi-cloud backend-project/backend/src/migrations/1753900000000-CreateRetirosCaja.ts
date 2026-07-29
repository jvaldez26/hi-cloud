import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRetirosCaja1753900000000 implements MigrationInterface {
  name = 'CreateRetirosCaja1753900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS retiros_caja (
        id               SERIAL PRIMARY KEY,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "empresaId"      INTEGER     NOT NULL,
        "cajaDiariaId"   INTEGER     NOT NULL,
        "usuarioId"      INTEGER     NOT NULL,
        "usuarioNombre"  VARCHAR(150),
        monto            DECIMAL(12,2) NOT NULL,
        descripcion      VARCHAR(300)  NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_retiros_caja_empresa_caja"
        ON retiros_caja ("empresaId", "cajaDiariaId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS retiros_caja`);
  }
}
