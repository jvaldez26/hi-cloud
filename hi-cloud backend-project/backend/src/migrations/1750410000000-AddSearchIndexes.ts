import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSearchIndexes1750410000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // clientes: búsqueda por RNC (ECF) y por nombre (listados con filtro)
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_clientes_empresa_rnc
        ON clientes ("empresaId", "rncReceptor")
        WHERE "rncReceptor" IS NOT NULL
    `);
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_clientes_empresa_nombre
        ON clientes ("empresaId", nombre)
    `);

    // productos: búsqueda por código en facturación y compras
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_productos_empresa_codigo
        ON productos ("empresaId", codigo)
        WHERE codigo IS NOT NULL
    `);

    // proveedores: búsqueda por RNC en compras
    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_proveedores_empresa_rnc
        ON proveedores ("empresaId", rnc)
        WHERE rnc IS NOT NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_clientes_empresa_rnc`);
    await qr.query(`DROP INDEX IF EXISTS idx_clientes_empresa_nombre`);
    await qr.query(`DROP INDEX IF EXISTS idx_productos_empresa_codigo`);
    await qr.query(`DROP INDEX IF EXISTS idx_proveedores_empresa_rnc`);
  }
}
