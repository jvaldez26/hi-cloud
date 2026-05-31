import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMonedaToCxC1749980000000 implements MigrationInterface {
  name = 'AddMonedaToCxC1749980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cuentas_por_cobrar
        ADD COLUMN IF NOT EXISTS moneda      VARCHAR(3)     NOT NULL DEFAULT 'DOP',
        ADD COLUMN IF NOT EXISTS "tipoCambio" DECIMAL(10,4) NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE pagos_cobrados
        ADD COLUMN IF NOT EXISTS moneda      VARCHAR(3)     NOT NULL DEFAULT 'DOP',
        ADD COLUMN IF NOT EXISTS "tipoCambio" DECIMAL(10,4) NOT NULL DEFAULT 1
    `);

    // Actualizar CxC existentes con la moneda/tasa de su factura
    await queryRunner.query(`
      UPDATE cuentas_por_cobrar cxc
      SET moneda = COALESCE(f.moneda, 'DOP'),
          "tipoCambio" = COALESCE(f."tipoCambio", 1)
      FROM facturas f
      WHERE f.id = cxc."facturaId"
        AND cxc.moneda = 'DOP'
        AND f.moneda != 'DOP'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE cuentas_por_cobrar DROP COLUMN IF EXISTS moneda, DROP COLUMN IF EXISTS "tipoCambio"`);
    await queryRunner.query(`ALTER TABLE pagos_cobrados DROP COLUMN IF EXISTS moneda, DROP COLUMN IF EXISTS "tipoCambio"`);
  }
}
