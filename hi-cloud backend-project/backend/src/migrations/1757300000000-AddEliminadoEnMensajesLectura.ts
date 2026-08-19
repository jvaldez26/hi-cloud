import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEliminadoEnMensajesLectura1757300000000 implements MigrationInterface {
  name = 'AddEliminadoEnMensajesLectura1757300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE mensajes_lectura
        ADD COLUMN IF NOT EXISTS "eliminadoEn" timestamp NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE mensajes_lectura
        DROP COLUMN IF EXISTS "eliminadoEn"
    `);
  }
}
