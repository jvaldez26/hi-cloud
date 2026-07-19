import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M1: vincula la aplicación de insumo con el inventario (ag_insumos) por id, para
 * poder descontar stock al consumir. Nullable + IF NOT EXISTS: las aplicaciones
 * viejas (texto libre, sin insumoId) quedan con NULL y no descuentan nada.
 * Naming camelCase entre comillas (TypeORM sin NamingStrategy).
 */
export class AddInsumoIdToAplicaciones1753000000000 implements MigrationInterface {
  name = 'AddInsumoIdToAplicaciones1753000000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE ag_aplicaciones_insumo ADD COLUMN IF NOT EXISTS "insumoId" INTEGER NULL DEFAULT NULL`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ag_aplicaciones_insumo_insumo ON ag_aplicaciones_insumo ("insumoId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_ag_aplicaciones_insumo_insumo`);
    await qr.query(`ALTER TABLE ag_aplicaciones_insumo DROP COLUMN IF EXISTS "insumoId"`);
  }
}
