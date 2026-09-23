import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clasificación del ITBIS por línea de compra / por gasto — alimenta las
 * casillas 45-51 del Anexo A del IT-1 con datos reales en vez de "no
 * aplica" en bloque (anexo-a.service.ts). NULLABLE a propósito: NULL se
 * trata igual que 'gravado' (el comportamiento de hoy) — sin backfill,
 * nada que reclasificar retroactivamente.
 */
export class AddDestinoItbisComprasGastos1767000000000 implements MigrationInterface {
  name = 'AddDestinoItbisComprasGastos1767000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`ALTER TABLE compra_detalles ADD COLUMN IF NOT EXISTS "destinoItbis" VARCHAR(30)`);
    await queryRunner.query(`ALTER TABLE compra_detalles ADD COLUMN IF NOT EXISTS "destinoItbisMotivo" TEXT`);
    await queryRunner.query(`
      ALTER TABLE compra_detalles
        ADD CONSTRAINT chk_compra_detalles_destino_itbis
          CHECK ("destinoItbis" IS NULL OR "destinoItbis" IN ('gravado','exportacion','exento','activo_categoria_i','otro'))
    `);

    await queryRunner.query(`ALTER TABLE gastos ADD COLUMN IF NOT EXISTS "destinoItbis" VARCHAR(30)`);
    await queryRunner.query(`ALTER TABLE gastos ADD COLUMN IF NOT EXISTS "destinoItbisMotivo" TEXT`);
    await queryRunner.query(`
      ALTER TABLE gastos
        ADD CONSTRAINT chk_gastos_destino_itbis
          CHECK ("destinoItbis" IS NULL OR "destinoItbis" IN ('gravado','exportacion','exento','activo_categoria_i','otro'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`ALTER TABLE gastos DROP CONSTRAINT IF EXISTS chk_gastos_destino_itbis`);
    await queryRunner.query(`ALTER TABLE gastos DROP COLUMN IF EXISTS "destinoItbisMotivo"`);
    await queryRunner.query(`ALTER TABLE gastos DROP COLUMN IF EXISTS "destinoItbis"`);

    await queryRunner.query(`ALTER TABLE compra_detalles DROP CONSTRAINT IF EXISTS chk_compra_detalles_destino_itbis`);
    await queryRunner.query(`ALTER TABLE compra_detalles DROP COLUMN IF EXISTS "destinoItbisMotivo"`);
    await queryRunner.query(`ALTER TABLE compra_detalles DROP COLUMN IF EXISTS "destinoItbis"`);
  }
}
