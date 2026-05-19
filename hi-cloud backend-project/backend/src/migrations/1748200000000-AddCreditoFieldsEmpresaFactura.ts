import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Columnas añadidas a entidades sin migración correspondiente:
 *
 * commit 4550311 (2026-05-12): crédito en empresa + facturas
 * commit dd6b752 (2026-05): clienteId en recibos_cobro
 *
 * Sin esta migración register() falla con 500 y toda lectura de
 * recibos_cobro falla porque TypeORM incluye las columnas en el SQL.
 */
export class AddCreditoFieldsEmpresaFactura1748200000000 implements MigrationInterface {
  name = 'AddCreditoFieldsEmpresaFactura1748200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── empresa: campos de crédito ────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE empresa
        ADD COLUMN IF NOT EXISTS "diasCreditoDefault"    INTEGER        NOT NULL DEFAULT 30,
        ADD COLUMN IF NOT EXISTS "limiteCreditoDefault"  DECIMAL(14,2)  NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "creditoHabilitado"     BOOLEAN        NOT NULL DEFAULT true;
    `);

    // ── facturas: tipo de pago y crédito ──────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE facturas
        ADD COLUMN IF NOT EXISTS "tipoPago"          VARCHAR(10)  NOT NULL DEFAULT 'CONTADO',
        ADD COLUMN IF NOT EXISTS "diasCredito"       INTEGER      NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "fechaVencimiento"  DATE;
    `);

    // ── recibos_cobro: clienteId para búsqueda por cliente ────────────────────
    await queryRunner.query(`
      ALTER TABLE recibos_cobro
        ADD COLUMN IF NOT EXISTS "clienteId" INTEGER;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_recibos_cobro_empresa_cliente"
        ON recibos_cobro ("empresaId", "clienteId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_recibos_cobro_empresa_cliente";`);

    await queryRunner.query(`
      ALTER TABLE recibos_cobro
        DROP COLUMN IF EXISTS "clienteId";
    `);

    await queryRunner.query(`
      ALTER TABLE facturas
        DROP COLUMN IF EXISTS "tipoPago",
        DROP COLUMN IF EXISTS "diasCredito",
        DROP COLUMN IF EXISTS "fechaVencimiento";
    `);

    await queryRunner.query(`
      ALTER TABLE empresa
        DROP COLUMN IF EXISTS "diasCreditoDefault",
        DROP COLUMN IF EXISTS "limiteCreditoDefault",
        DROP COLUMN IF EXISTS "creditoHabilitado";
    `);
  }
}
