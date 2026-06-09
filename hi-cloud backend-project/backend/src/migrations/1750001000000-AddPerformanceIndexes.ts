import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1750001000000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1750001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ECF — índices por empresa (los existentes son por trackId/origen, faltan los de empresa)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ecf_empresa_estado
        ON ecf ("empresaId", "estadoDGII")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ecf_empresa_fecha
        ON ecf ("empresaId", "createdAt" DESC)
    `);

    // Facturas — filtrar por cliente dentro de empresa
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_facturas_cliente
        ON facturas ("empresaId", "clienteId")
    `);

    // CxC — filtrar por cliente dentro de empresa
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_cxc_cliente
        ON cuentas_por_cobrar ("empresaId", "clienteId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ecf_empresa_estado`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ecf_empresa_fecha`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_facturas_cliente`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cxc_cliente`);
  }
}
