import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HiCloud Xlink — vínculo comercial entre un cliente/proveedor propio y la
 * empresa de la contraparte en el directorio.
 *
 * `xlinkEmpresaXlinkId` guarda el `empresa.xlinkId` (no el `id` secuencial)
 * de la contraparte — mismo criterio que la migración de empresa: nunca
 * exponer/enlazar por el id interno. FK sobre una columna UNIQUE (no la PK)
 * en una tabla separada de la constraint (ver más abajo) por la regla del
 * proyecto de no combinar ADD COLUMN con ADD CONSTRAINT en la misma
 * sentencia — clientes/proveedores son tablas con datos reales en producción.
 *
 * ON DELETE SET NULL: si la empresa de la contraparte alguna vez desaparece
 * del directorio, el vínculo se cae solo — nunca debe bloquear ni cascadear
 * sobre el propio cliente/proveedor.
 *
 * `sincronizarArticulosXlink` en AMBAS tablas por simetría con el pedido
 * original, aunque hoy solo se usa desde el lado proveedor (Fase 4: exige
 * mapeo de producto por línea cuando está en true).
 */
export class AddXlinkToClientesProveedores1768500000000 implements MigrationInterface {
  name = 'AddXlinkToClientesProveedores1768500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE clientes
        ADD COLUMN IF NOT EXISTS "xlinkEmpresaXlinkId" UUID NULL
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE clientes
        ADD COLUMN IF NOT EXISTS "sincronizarArticulosXlink" BOOLEAN NOT NULL DEFAULT false
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE proveedores
        ADD COLUMN IF NOT EXISTS "xlinkEmpresaXlinkId" UUID NULL
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE proveedores
        ADD COLUMN IF NOT EXISTS "sincronizarArticulosXlink" BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_clientes_xlinkEmpresaXlinkId"
        ON clientes ("xlinkEmpresaXlinkId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_proveedores_xlinkEmpresaXlinkId"
        ON proveedores ("xlinkEmpresaXlinkId")
    `);

    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE clientes
        ADD CONSTRAINT "fk_clientes_xlink_empresa"
        FOREIGN KEY ("xlinkEmpresaXlinkId") REFERENCES empresa("xlinkId") ON DELETE SET NULL
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE proveedores
        ADD CONSTRAINT "fk_proveedores_xlink_empresa"
        FOREIGN KEY ("xlinkEmpresaXlinkId") REFERENCES empresa("xlinkId") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`ALTER TABLE clientes DROP CONSTRAINT IF EXISTS "fk_clientes_xlink_empresa"`);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`ALTER TABLE proveedores DROP CONSTRAINT IF EXISTS "fk_proveedores_xlink_empresa"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_clientes_xlinkEmpresaXlinkId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_proveedores_xlinkEmpresaXlinkId"`);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE clientes
        DROP COLUMN IF EXISTS "sincronizarArticulosXlink",
        DROP COLUMN IF EXISTS "xlinkEmpresaXlinkId"
    `);
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE proveedores
        DROP COLUMN IF EXISTS "sincronizarArticulosXlink",
        DROP COLUMN IF EXISTS "xlinkEmpresaXlinkId"
    `);
  }
}
