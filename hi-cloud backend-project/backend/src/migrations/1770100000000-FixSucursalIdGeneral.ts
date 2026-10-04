import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige sucursalId NULL de forma general, sin ids fijos: para cada
 * EMPRESA con EXACTAMENTE UNA sucursal activa, asigna esa sucursal a
 * todas las filas con sucursalId NULL en las tablas que lo escriben desde
 * el CLS (ver TenantService.getSucursalId()).
 *
 * Causa raíz (caja #714, empresa 44, Maximo Almonte, 2026-10-03):
 * AuthService.buildAccessTokenForUser() — usado por POST /auth/refresh —
 * nunca resolvía sucursalId, así que cualquier petición hecha con un
 * access token renovado (varias veces al día) perdía la sucursal del CLS.
 * Ya corregido en auth.service.ts; esta migración solo repara el dato que
 * quedó mal ANTES de ese fix, en cualquier tabla afectada.
 *
 * Alcance — verificado con un conteo de SOLO LECTURA en producción antes
 * de escribir esta migración (36 empresas con una sola sucursal activa):
 *   cierres_caja: 5 filas (empresa 44)
 *   facturas:     58 filas (empresas 44, 53, 55, 57, 59)
 *   notas_credito: 2 filas (empresa 44)
 *   compras:      1 fila  (empresa 73)
 *   gastos:       2 filas (empresa 44)
 *   conduces:     31 filas (empresas 42, 57, 61)
 *   — cotizaciones, pre_facturas y pro_formas: sin filas NULL en empresas
 *     de una sola sucursal, no se tocan.
 *   — movimientos_inventario: no tiene columna sucursalId (usa almacenId),
 *     no aplica.
 *
 * NO toca ninguna fila de una empresa con 0 o 2+ sucursales activas — esas
 * quedan para que el dueño del negocio decida caso por caso (no hay una
 * sucursal "correcta" obvia que asignarles).
 *
 * Idempotente: una fila ya no-NULL no vuelve a aparecer en el UPDATE (el
 * WHERE exige sucursalId IS NULL), y el INSERT del respaldo usa ON
 * CONFLICT DO NOTHING. Guarda en _backup_fix_sucursal_general (tabla, id,
 * empresaId) exactamente las filas que cambió, para que down() revierta
 * solo esas — nunca una fila que no haya sido tocada por este up().
 */
const TABLAS_CON_SUCURSAL_DESDE_CLS = [
  'cierres_caja', 'facturas', 'notas_credito', 'compras', 'gastos', 'conduces',
] as const;

export class FixSucursalIdGeneral1770100000000 implements MigrationInterface {
  name = 'FixSucursalIdGeneral1770100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS _backup_fix_sucursal_general (
        tabla         VARCHAR(50) NOT NULL,
        id            INTEGER     NOT NULL,
        "empresaId"   INTEGER     NOT NULL,
        "corregidoEn" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tabla, id)
      )
    `);

    for (const tabla of TABLAS_CON_SUCURSAL_DESDE_CLS) {
      const filas: { id: number; empresaId: number }[] = await queryRunner.query(`
        WITH una_sucursal AS (
          SELECT s."empresaId", MIN(s.id) AS "sucursalId"
          FROM sucursales s
          WHERE s."isActive" = true
          GROUP BY s."empresaId"
          HAVING COUNT(*) = 1
        ),
        actualizado AS (
          UPDATE ${tabla} t
          SET "sucursalId" = u."sucursalId"
          FROM una_sucursal u
          WHERE t."empresaId" = u."empresaId" AND t."sucursalId" IS NULL
          RETURNING t.id, t."empresaId" AS "empresaId"
        )
        INSERT INTO _backup_fix_sucursal_general (tabla, id, "empresaId")
        SELECT '${tabla}', id, "empresaId" FROM actualizado
        ON CONFLICT (tabla, id) DO NOTHING
        RETURNING id, "empresaId"
      `);
      console.log(`[FixSucursalIdGeneral] ${tabla}: ${filas.length} fila(s) corregidas`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of TABLAS_CON_SUCURSAL_DESDE_CLS) {
      const ids: { id: number }[] = await queryRunner.query(
        `SELECT id FROM _backup_fix_sucursal_general WHERE tabla = $1`, [tabla],
      );
      if (ids.length) {
        await queryRunner.query(
          `UPDATE ${tabla} SET "sucursalId" = NULL WHERE id = ANY($1::int[])`,
          [ids.map(r => r.id)],
        );
      }
    }
    await queryRunner.query(`DROP TABLE IF EXISTS _backup_fix_sucursal_general`);
  }
}
