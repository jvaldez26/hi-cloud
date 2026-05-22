import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PROBLEMA: stock_almacen estaba vacía — nunca se pobló desde productos.stock.
 * El módulo de Almacenes mostraba 0 productos y RD$0.00 en todos los almacenes.
 *
 * ESTA MIGRACIÓN:
 * 1. Garantiza que cada empresa tiene un almacén "Principal"
 * 2. Puebla stock_almacen desde productos.stock (estado actual del inventario)
 * 3. Corrige el unique constraint global en transferencias_almacen.numero
 *    → debe ser único POR EMPRESA, no globalmente
 */
export class SeedStockAlmacen1749000000000 implements MigrationInterface {
  name = 'SeedStockAlmacen1749000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Crear almacén "Principal" para cada empresa que no tenga uno ─────
    await queryRunner.query(`
      INSERT INTO almacenes (nombre, "empresaId", activo, "isActive", "createdAt", "updatedAt")
      SELECT
        'Principal',
        e.id,
        true,
        true,
        NOW(),
        NOW()
      FROM empresa e
      WHERE e."isActive" = true
        AND NOT EXISTS (
          SELECT 1 FROM almacenes a
          WHERE a."empresaId" = e.id
            AND a."isActive"  = true
            AND a.activo      = true
        )
      ON CONFLICT DO NOTHING
    `);

    // ── 2. Poblar stock_almacen desde productos.stock ─────────────────────────
    //    Asigna el stock actual de cada producto al almacén Principal de su empresa.
    //    ON CONFLICT: si ya existe un registro, actualizar solo si el stock es diferente.
    await queryRunner.query(`
      INSERT INTO stock_almacen (
        "empresaId",
        "almacenId",
        "productoId",
        stock,
        "stockMinimo",
        "isActive",
        "createdAt",
        "updatedAt"
      )
      SELECT
        p."empresaId",
        a_principal.id   AS "almacenId",
        p.id             AS "productoId",
        GREATEST(p.stock, 0),          -- nunca insertar negativos
        COALESCE(p."stockMinimo", 0),
        true,
        NOW(),
        NOW()
      FROM productos p
      JOIN (
        -- El almacén principal de cada empresa = el de menor id (el primero creado)
        SELECT DISTINCT ON ("empresaId") id, "empresaId"
        FROM almacenes
        WHERE "isActive" = true AND activo = true
        ORDER BY "empresaId", id ASC
      ) a_principal ON a_principal."empresaId" = p."empresaId"
      WHERE p."isActive" = true
      ON CONFLICT ("almacenId", "productoId") DO UPDATE SET
        stock        = EXCLUDED.stock,
        "stockMinimo"= EXCLUDED."stockMinimo",
        "updatedAt"  = NOW()
    `);

    // ── 3. Corregir unique constraint global en transferencias_almacen.numero ─
    //    El número de transferencia debe ser único POR EMPRESA, no globalmente.
    //    Si existe una constraint simple de una columna, la eliminamos.
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t    ON t.oid = c.conrelid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
          WHERE t.relname         = 'transferencias_almacen'
            AND c.contype         = 'u'
            AND a.attname         = 'numero'
            AND array_length(c.conkey, 1) = 1
        LOOP
          EXECUTE format('ALTER TABLE transferencias_almacen DROP CONSTRAINT %I', r.conname);
          RAISE NOTICE 'Dropped constraint: %', r.conname;
        END LOOP;
      END $$;
    `);

    // Crear índice único compuesto (empresaId, numero)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_transf_almacen_empresa_numero"
      ON transferencias_almacen("empresaId", numero)
      WHERE numero IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_transf_almacen_empresa_numero"`);
    // No revertir los datos de stock_almacen ni los almacenes creados
  }
}
