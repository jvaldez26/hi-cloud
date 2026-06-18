import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSucursalIdToNotasCredito1750180000000 implements MigrationInterface {
  name = 'AddSucursalIdToNotasCredito1750180000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notas_credito
      ADD COLUMN IF NOT EXISTS "sucursalId" integer
      REFERENCES sucursales(id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notas_credito_sucursal
      ON notas_credito ("empresaId", "sucursalId", "isActive");
    `);

    // Backfill: heredar sucursalId de la factura original cuando existe
    await queryRunner.query(`
      UPDATE notas_credito nc
      SET "sucursalId" = f."sucursalId"
      FROM facturas f
      WHERE nc."facturaOriginalId" = f.id
        AND nc."sucursalId" IS NULL
        AND f."sucursalId" IS NOT NULL;
    `);

    // Para las que quedan sin sucursal, asignar la sucursal principal de la empresa
    await queryRunner.query(`
      UPDATE notas_credito nc
      SET "sucursalId" = (
        SELECT s.id FROM sucursales s
        WHERE s."empresaId" = nc."empresaId"
          AND s."esPrincipal" = true
          AND s."isActive"   = true
        LIMIT 1
      )
      WHERE nc."sucursalId" IS NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_notas_credito_sucursal`);
    await queryRunner.query(`ALTER TABLE notas_credito DROP COLUMN IF EXISTS "sucursalId"`);
  }
}
