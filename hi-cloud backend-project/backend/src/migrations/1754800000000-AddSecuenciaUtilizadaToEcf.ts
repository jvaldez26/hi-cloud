import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSecuenciaUtilizadaToEcf1754800000000 implements MigrationInterface {
  name = 'AddSecuenciaUtilizadaToEcf1754800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    // true  = DGII quemó la secuencia al rechazar → la NC requiere un nuevo e-NCF
    // false = DGII no quemó la secuencia → se puede corregir y reenviar el mismo e-NCF
    // null  = información no disponible (rechazos via batch sin dgiiResponse[])
    await queryRunner.query(
      `ALTER TABLE ecf ADD COLUMN IF NOT EXISTS "secuenciaUtilizada" BOOLEAN NULL DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(
      `ALTER TABLE ecf DROP COLUMN IF EXISTS "secuenciaUtilizada"`,
    );
  }
}
