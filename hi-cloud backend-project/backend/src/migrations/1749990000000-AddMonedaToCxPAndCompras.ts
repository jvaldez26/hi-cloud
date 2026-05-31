import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMonedaToCxPAndCompras1749990000000 implements MigrationInterface {
  name = 'AddMonedaToCxPAndCompras1749990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── CuentaPorPagar ──────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE cuentas_por_pagar
        ADD COLUMN IF NOT EXISTS moneda       VARCHAR(3)     NOT NULL DEFAULT 'DOP',
        ADD COLUMN IF NOT EXISTS "tipoCambio" DECIMAL(10,4)  NOT NULL DEFAULT 1
    `);

    // ── PagoRealizado ───────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE pagos_realizados
        ADD COLUMN IF NOT EXISTS moneda       VARCHAR(3)     NOT NULL DEFAULT 'DOP',
        ADD COLUMN IF NOT EXISTS "tipoCambio" DECIMAL(10,4)  NOT NULL DEFAULT 1
    `);

    // ── Compras ─────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE compras
        ADD COLUMN IF NOT EXISTS moneda       VARCHAR(3)          DEFAULT 'DOP',
        ADD COLUMN IF NOT EXISTS "tipoCambio" DECIMAL(10,4)       DEFAULT 1
    `);

    // Sincronizar CxP existentes con moneda de su compra (por si alguna compra tenía USD)
    await queryRunner.query(`
      UPDATE cuentas_por_pagar cxp
      SET moneda       = COALESCE(c.moneda, 'DOP'),
          "tipoCambio" = COALESCE(c."tipoCambio", 1)
      FROM compras c
      WHERE c.id = cxp."compraId"
        AND cxp.moneda = 'DOP'
        AND c.moneda IS NOT NULL
        AND c.moneda != 'DOP'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE cuentas_por_pagar  DROP COLUMN IF EXISTS moneda, DROP COLUMN IF EXISTS "tipoCambio"`);
    await queryRunner.query(`ALTER TABLE pagos_realizados   DROP COLUMN IF EXISTS moneda, DROP COLUMN IF EXISTS "tipoCambio"`);
    await queryRunner.query(`ALTER TABLE compras            DROP COLUMN IF EXISTS moneda, DROP COLUMN IF EXISTS "tipoCambio"`);
  }
}
