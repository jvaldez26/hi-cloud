import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSucursalIdToGastos1750160000000 implements MigrationInterface {
  name = 'AddSucursalIdToGastos1750160000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Agregar columna sucursalId (nullable para no romper gastos existentes)
    await queryRunner.query(`
      ALTER TABLE gastos
      ADD COLUMN IF NOT EXISTS "sucursalId" integer
      REFERENCES sucursales(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_gastos_sucursal
      ON gastos ("empresaId", "sucursalId", "isActive");
    `);

    // Backfill: asignar sucursal principal de cada empresa a gastos históricos sin sucursal
    await queryRunner.query(`
      UPDATE gastos g
      SET "sucursalId" = (
        SELECT s.id FROM sucursales s
        WHERE s."empresaId" = g."empresaId"
          AND s."esPrincipal" = true
          AND s."isActive"   = true
        LIMIT 1
      )
      WHERE g."sucursalId" IS NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_gastos_sucursal`);
    await queryRunner.query(`ALTER TABLE gastos DROP COLUMN IF EXISTS "sucursalId"`);
  }
}
