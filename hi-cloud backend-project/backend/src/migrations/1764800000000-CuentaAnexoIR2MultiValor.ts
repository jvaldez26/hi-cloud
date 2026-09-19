import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FASE 4 Bloque A del catálogo fiscal dominicano — convierte anexoIR2/
 * casillaIR2 de columnas únicas en `cuentas_contables` a una relación
 * (`cuenta_anexo_ir2`): una cuenta puede aportar su saldo a MÁS DE UN anexo
 * del IR-2 a la vez, no es una excepción, es la norma (ver comentario en
 * cuenta-anexo-ir2.entity.ts — caso de referencia: las 4 cuentas de
 * Inventario, A1 y D simultáneamente).
 *
 * 1. Crea `cuenta_anexo_ir2` (empresaId denormalizado, igual que el resto
 *    del catálogo — TenantScoped).
 * 2. Migra cada fila de `cuentas_contables` que tenga anexoIR2 no nulo a
 *    una fila de la tabla nueva (1 fila vieja → 1 fila nueva; las cuentas
 *    con más de un anexo, como Inventario, las etiqueta de nuevo el propio
 *    seed/servicio después de esta migración — aquí no se inventa una
 *    segunda etiqueta que no existía).
 * 3. Elimina anexoIR2/casillaIR2 de `cuentas_contables` — deja de haber dos
 *    fuentes de verdad.
 *
 * Idempotente: el paso 2 solo corre si las columnas viejas todavía existen
 * (si la migración ya corrió antes, las columnas ya no están — se detecta
 * por information_schema y se salta el copiado sin error). CREATE TABLE con
 * IF NOT EXISTS, DROP COLUMN con IF EXISTS.
 *
 * down() deliberadamente NO recrea los datos — mismo criterio que las
 * migraciones de datos anteriores de esta tarea (1764300000000,
 * 1764600000000, 1764700000000): para el momento de un rollback pueden
 * existir etiquetas nuevas (varias por cuenta) que ya no caben en la
 * columna única vieja sin perder información.
 */
export class CuentaAnexoIR2MultiValor1764800000000 implements MigrationInterface {
  name = 'CuentaAnexoIR2MultiValor1764800000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS cuenta_anexo_ir2 (
        id SERIAL PRIMARY KEY,
        "empresaId" integer,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "cuentaContableId" integer NOT NULL REFERENCES cuentas_contables(id) ON DELETE CASCADE,
        "anexoIR2" varchar(2) NOT NULL,
        "casillaIR2" varchar(30)
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_cuenta_anexo_ir2_cuentaContableId" ON cuenta_anexo_ir2 ("cuentaContableId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "IDX_cuenta_anexo_ir2_empresaId" ON cuenta_anexo_ir2 ("empresaId")`);

    const columnasViejas: { column_name: string }[] = await qr.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'cuentas_contables' AND column_name = 'anexoIR2'
    `);
    if (columnasViejas.length > 0) {
      await qr.query(`
        INSERT INTO cuenta_anexo_ir2 ("empresaId", "cuentaContableId", "anexoIR2", "casillaIR2")
        SELECT "empresaId", id, "anexoIR2", "casillaIR2"
        FROM cuentas_contables
        WHERE "anexoIR2" IS NOT NULL
      `);
      await qr.query(`ALTER TABLE cuentas_contables DROP COLUMN IF EXISTS "anexoIR2"`);
      await qr.query(`ALTER TABLE cuentas_contables DROP COLUMN IF EXISTS "casillaIR2"`);
    }

    // Las 4 cuentas de Inventario quedaron SIN ninguna etiqueta desde Fase 2
    // — necesitan A1 (Balance) Y D (Costo de Venta) a la vez, algo que la
    // columna única no permitía sin perder una de las dos. Se etiquetan
    // aquí para las empresas que ya existían; seedPlanCuentas ya hace lo
    // mismo para empresas nuevas de aquí en adelante. Fuera del bloque
    // anterior (no depende de que las columnas viejas existieran) e
    // idempotente por NOT EXISTS (cuentaContableId, anexoIR2) — reejecutar
    // esta migración no duplica nada, tampoco si el seed ya adelantó el
    // trabajo para alguna empresa.
    await qr.query(`
      INSERT INTO cuenta_anexo_ir2 ("empresaId", "cuentaContableId", "anexoIR2", "casillaIR2")
      SELECT cc."empresaId", cc.id, 'A1', NULL
      FROM cuentas_contables cc
      WHERE cc.codigo IN ('1.1.3.01','1.1.3.02','1.1.3.03','1.1.3.04')
        AND NOT EXISTS (
          SELECT 1 FROM cuenta_anexo_ir2 x
          WHERE x."cuentaContableId" = cc.id AND x."anexoIR2" = 'A1' AND x."isActive" = true
        )
    `);
    await qr.query(`
      INSERT INTO cuenta_anexo_ir2 ("empresaId", "cuentaContableId", "anexoIR2", "casillaIR2")
      SELECT cc."empresaId", cc.id, 'D',
        CASE cc.codigo
          WHEN '1.1.3.01' THEN 'inv_mercancias'
          WHEN '1.1.3.02' THEN 'inv_produccion_proceso'
          WHEN '1.1.3.03' THEN 'inv_productos_terminados'
          WHEN '1.1.3.04' THEN 'inv_materia_prima'
        END
      FROM cuentas_contables cc
      WHERE cc.codigo IN ('1.1.3.01','1.1.3.02','1.1.3.03','1.1.3.04')
        AND NOT EXISTS (
          SELECT 1 FROM cuenta_anexo_ir2 x
          WHERE x."cuentaContableId" = cc.id AND x."anexoIR2" = 'D' AND x."isActive" = true
        )
    `);
  }

  public async down(): Promise<void> {
    // No-op intencional — ver comentario de cabecera.
  }
}
