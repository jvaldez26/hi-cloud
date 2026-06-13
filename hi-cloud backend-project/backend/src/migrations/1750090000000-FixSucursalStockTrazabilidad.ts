import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FASE 2A — facturas.almacenId          (columna faltaba en producción)
 * FASE 2B — compras.sucursalId TEXT→INT (tipo incorrecto)
 * FASE 2C — movimientos_inventario.almacenId (trazabilidad por almacén)
 */
export class FixSucursalStockTrazabilidad1750090000000 implements MigrationInterface {
  name = 'FixSucursalStockTrazabilidad1750090000000';

  async up(qr: QueryRunner): Promise<void> {
    // ── FASE 2A: facturas.almacenId ─────────────────────────────────────────
    await qr.query(`ALTER TABLE facturas ADD COLUMN IF NOT EXISTS "almacenId" INTEGER`);

    // Para facturas que ya tienen sucursalId, inferir almacenId desde almacenPrincipalId
    await qr.query(`
      UPDATE facturas f
      SET "almacenId" = s."almacenPrincipalId"
      FROM sucursales s
      WHERE f."sucursalId" = s.id
        AND f."almacenId" IS NULL
        AND s."almacenPrincipalId" IS NOT NULL
    `);

    // ── FASE 2B: compras.sucursalId TEXT → INTEGER ───────────────────────────
    // Crear columna temporal INTEGER, migrar datos válidos, renombrar
    await qr.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS "sucursalId_int" INTEGER`);
    await qr.query(`
      UPDATE compras
      SET "sucursalId_int" = CASE
        WHEN "sucursalId" ~ '^[0-9]+$' THEN "sucursalId"::integer
        ELSE NULL
      END
      WHERE "sucursalId" IS NOT NULL
    `);
    await qr.query(`ALTER TABLE compras DROP COLUMN IF EXISTS "sucursalId"`);
    await qr.query(`ALTER TABLE compras RENAME COLUMN "sucursalId_int" TO "sucursalId"`);

    // ── FASE 2C: movimientos_inventario.almacenId ───────────────────────────
    await qr.query(`ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS "almacenId" INTEGER`);

    // Para movimientos históricos: asignar el almacén principal de la sucursal principal
    // de cada empresa (no podemos saber el almacén real de movimientos previos)
    await qr.query(`
      UPDATE movimientos_inventario mi
      SET "almacenId" = s."almacenPrincipalId"
      FROM sucursales s
      WHERE s."empresaId" = mi."empresaId"
        AND s."esPrincipal" = true
        AND s."almacenPrincipalId" IS NOT NULL
        AND mi."almacenId" IS NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE movimientos_inventario DROP COLUMN IF EXISTS "almacenId"`);

    // Restaurar compras.sucursalId como TEXT (reversión)
    await qr.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS "sucursalId_text" TEXT`);
    await qr.query(`UPDATE compras SET "sucursalId_text" = "sucursalId"::text WHERE "sucursalId" IS NOT NULL`);
    await qr.query(`ALTER TABLE compras DROP COLUMN IF EXISTS "sucursalId"`);
    await qr.query(`ALTER TABLE compras RENAME COLUMN "sucursalId_text" TO "sucursalId"`);

    await qr.query(`ALTER TABLE facturas DROP COLUMN IF EXISTS "almacenId"`);
  }
}
