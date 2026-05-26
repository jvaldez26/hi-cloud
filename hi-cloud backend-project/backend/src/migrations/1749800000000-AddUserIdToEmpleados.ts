import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdToEmpleados1749800000000 implements MigrationInterface {
  name = 'AddUserIdToEmpleados1749800000000';

  async up(qr: QueryRunner): Promise<void> {
    // Agregar columna userId nullable — vincula empleado ↔ usuario del sistema
    await qr.query(`
      ALTER TABLE empleados
      ADD COLUMN IF NOT EXISTS "userId" integer NULL
    `);

    // Índice para lookup rápido en portal-empleado
    await qr.query(`
      CREATE INDEX IF NOT EXISTS "IDX_empleados_userId"
      ON empleados ("userId")
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS "IDX_empleados_userId"`);
    await qr.query(`ALTER TABLE empleados DROP COLUMN IF EXISTS "userId"`);
  }
}
