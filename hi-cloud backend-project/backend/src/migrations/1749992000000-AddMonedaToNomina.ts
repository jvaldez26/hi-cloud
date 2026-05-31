import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMonedaToNomina1749992000000 implements MigrationInterface {
  name = 'AddMonedaToNomina1749992000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Empleados: moneda del salario (Zona Franca puede ser USD)
    await queryRunner.query(`
      ALTER TABLE empleados
        ADD COLUMN IF NOT EXISTS moneda       VARCHAR(3)    DEFAULT 'DOP',
        ADD COLUMN IF NOT EXISTS "tipoCambio" DECIMAL(10,4) DEFAULT 1
    `);

    // Nómina lineas: moneda + tasa usada al procesar + monto USD original
    await queryRunner.query(`
      ALTER TABLE nomina_lineas
        ADD COLUMN IF NOT EXISTS moneda           VARCHAR(3)    DEFAULT 'DOP',
        ADD COLUMN IF NOT EXISTS "tipoCambio"     DECIMAL(10,4) DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "salarioBaseUSD" DECIMAL(12,2) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE empleados     DROP COLUMN IF EXISTS moneda, DROP COLUMN IF EXISTS "tipoCambio"`);
    await queryRunner.query(`ALTER TABLE nomina_lineas DROP COLUMN IF EXISTS moneda, DROP COLUMN IF EXISTS "tipoCambio", DROP COLUMN IF EXISTS "salarioBaseUSD"`);
  }
}
