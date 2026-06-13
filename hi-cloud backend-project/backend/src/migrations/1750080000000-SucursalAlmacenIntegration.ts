import { MigrationInterface, QueryRunner } from 'typeorm';

export class SucursalAlmacenIntegration1750080000000 implements MigrationInterface {
  name = 'SucursalAlmacenIntegration1750080000000';

  async up(qr: QueryRunner): Promise<void> {
    // Sucursal → almacén principal
    await qr.query(`ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS "almacenPrincipalId" INTEGER`);

    // Almacén → sucursal a la que pertenece
    await qr.query(`ALTER TABLE almacenes ADD COLUMN IF NOT EXISTS "sucursalId" INTEGER`);

    // UsuarioEmpresa → sucursal asignada al usuario en esta empresa
    await qr.query(`ALTER TABLE usuario_empresa ADD COLUMN IF NOT EXISTS "sucursalId" INTEGER`);

    // Compra → almacén destino de la mercancía
    await qr.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS "almacenId" INTEGER`);

    // Seed: asignar sucursal principal como almacenPrincipalId de la primera sucursal
    // usando el primer almacén de cada empresa (no bloquea si falla)
    await qr.query(`
      UPDATE sucursales s
      SET "almacenPrincipalId" = (
        SELECT a.id FROM almacenes a
        WHERE a."empresaId" = s."empresaId"
          AND a."isActive" = true
        ORDER BY a.id ASC
        LIMIT 1
      )
      WHERE s."esPrincipal" = true
        AND s."almacenPrincipalId" IS NULL
    `).catch(() => null);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE compras DROP COLUMN IF EXISTS "almacenId"`);
    await qr.query(`ALTER TABLE usuario_empresa DROP COLUMN IF EXISTS "sucursalId"`);
    await qr.query(`ALTER TABLE almacenes DROP COLUMN IF EXISTS "sucursalId"`);
    await qr.query(`ALTER TABLE sucursales DROP COLUMN IF EXISTS "almacenPrincipalId"`);
  }
}
