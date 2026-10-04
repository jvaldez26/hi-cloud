import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige almacenId (y, en 1 caso puntual, empresaId) NULL en
 * movimientos_inventario — misma regla general que FixSucursalIdGeneral
 * (1770100000000), sin ids fijos: para cada EMPRESA con EXACTAMENTE UN
 * almacén activo, asigna ese almacén a sus movimientos con almacenId NULL.
 *
 * Causa raíz: cada camino que registraba un movimiento (facturas, compras,
 * entrada/salida manual, devoluciones) resolvía el almacén a su manera,
 * cayendo en último caso a `undefined` — y syncStockAlmacen() entonces
 * elegía "el almacén de menor id" EN SILENCIO para mantener el stock
 * correcto (por eso nunca hubo descuadre de cantidades), sin dejar ese
 * dato en el movimiento mismo. Ya corregido con InventarioService.
 * resolverAlmacenId(), una sola fuente de verdad sin adivinar — ver
 * inventario.service.ts.
 *
 * Alcance — verificado con un conteo de SOLO LECTURA en producción antes
 * de escribir esta migración (40 empresas con un solo almacén activo):
 *   empresaId 44: 1,549 filas (30/06 – 04/10)
 *   empresaId 73: 31 filas
 *   empresaId 42: 20 filas
 *   empresaId 61: 8 filas
 *   empresaId 57: 6 filas
 *   empresaId 55: 4 filas
 *   empresaId 76: 1 fila
 *   empresaId 72: 1 fila
 *   TOTAL: 1,620 filas (empresaId ya correcto, solo almacenId en NULL)
 *
 * Las 2 filas con empresaId NULL (ver diagnóstico anterior):
 *   - movimiento #11956 → producto de la empresa 44 (1 solo almacén,
 *     el #20) → esta migración le asigna empresaId=44 Y almacenId=20.
 *   - movimiento #214 → producto de la empresa 2, que tiene 2 ALMACENES
 *     activos — no hay un almacén único que asignarle sin adivinar (el
 *     mismo criterio de "nunca a ciegas" de resolverAlmacenId()). Esta
 *     migración NO la toca; queda para que el dueño del negocio decida.
 *
 * NO toca ninguna fila de una empresa con 0 o 2+ almacenes activos (el
 * conteo confirmó: ninguna de esas filas está en ese grupo salvo el
 * movimiento #214 ya descrito).
 *
 * Idempotente (WHERE almacenId/empresaId IS NULL + ON CONFLICT DO
 * NOTHING). Respaldo en _backup_fix_almacen_general (id, campo) — un par
 * por columna que de verdad cambió, para que down() revierta solo esas.
 */
export class FixAlmacenIdMovimientosInventario1770300000000 implements MigrationInterface {
  name = 'FixAlmacenIdMovimientosInventario1770300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS _backup_fix_almacen_general (
        id            INTEGER     NOT NULL,
        campo         VARCHAR(20) NOT NULL,
        "corregidoEn" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, campo)
      )
    `);

    // 1. Filas con empresaId YA correcto, solo falta almacenId.
    const filasAlmacen: { id: number }[] = await queryRunner.query(`
      WITH un_almacen AS (
        SELECT a."empresaId", MIN(a.id) AS "almacenId"
        FROM almacenes a
        WHERE a."isActive" = true AND a.activo = true
        GROUP BY a."empresaId"
        HAVING COUNT(*) = 1
      ),
      actualizado AS (
        UPDATE movimientos_inventario m
        SET "almacenId" = u."almacenId"
        FROM un_almacen u
        WHERE m."empresaId" = u."empresaId" AND m."almacenId" IS NULL
        RETURNING m.id
      )
      INSERT INTO _backup_fix_almacen_general (id, campo)
      SELECT id, 'almacenId' FROM actualizado
      ON CONFLICT (id, campo) DO NOTHING
      RETURNING id
    `);
    console.log(`[FixAlmacenIdMovimientosInventario] almacenId corregido en ${filasAlmacen.length} fila(s)`);

    // 2. Las filas con empresaId NULL: resolver la empresa por el producto;
    //    solo tocar las que caen en una empresa de un solo almacén (si la
    //    empresa resuelta tiene 0 o 2+ almacenes, el JOIN no matchea y la
    //    fila queda sin tocar — igual que el movimiento #214, empresa 2).
    const filasEmpresa: { id: number; campo: string }[] = await queryRunner.query(`
      WITH candidatos AS (
        SELECT m.id, p."empresaId" AS empresa_resuelta
        FROM movimientos_inventario m
        JOIN productos p ON p.id = m."productoId"
        WHERE m."empresaId" IS NULL
      ),
      un_almacen AS (
        SELECT a."empresaId", MIN(a.id) AS "almacenId"
        FROM almacenes a
        WHERE a."isActive" = true AND a.activo = true
        GROUP BY a."empresaId"
        HAVING COUNT(*) = 1
      ),
      actualizado AS (
        UPDATE movimientos_inventario m
        SET "empresaId" = c.empresa_resuelta, "almacenId" = ua."almacenId"
        FROM candidatos c
        JOIN un_almacen ua ON ua."empresaId" = c.empresa_resuelta
        WHERE m.id = c.id
        RETURNING m.id
      )
      INSERT INTO _backup_fix_almacen_general (id, campo)
      SELECT id, 'empresaId' FROM actualizado
      UNION ALL
      SELECT id, 'almacenId' FROM actualizado
      ON CONFLICT (id, campo) DO NOTHING
      RETURNING id, campo
    `);
    const filasSinEmpresaCorregidas = new Set(filasEmpresa.map(f => f.id)).size;
    if (filasSinEmpresaCorregidas) {
      console.log(`[FixAlmacenIdMovimientosInventario] empresaId+almacenId corregidos en ${filasSinEmpresaCorregidas} fila(s) que no tenían empresaId`);
    }

    // Lo que quedó sin tocar a propósito (empresa con 0 o 2+ almacenes) —
    // visible en el log, nunca adivinado.
    const [{ restantes }] = await queryRunner.query(
      `SELECT COUNT(*)::int AS restantes FROM movimientos_inventario WHERE "empresaId" IS NULL OR "almacenId" IS NULL`,
    );
    if (restantes > 0) {
      console.warn(
        `[FixAlmacenIdMovimientosInventario] Quedan ${restantes} fila(s) sin empresaId/almacenId — ` +
        `pertenecen a empresas con 0 o 2+ almacenes activos (o sin empresa resoluble). Requiere decisión manual.`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const filas: { id: number; campo: string }[] = await queryRunner.query(
      `SELECT id, campo FROM _backup_fix_almacen_general`,
    );
    const idsAlmacenId = filas.filter(f => f.campo === 'almacenId').map(f => f.id);
    const idsEmpresaId = filas.filter(f => f.campo === 'empresaId').map(f => f.id);

    if (idsAlmacenId.length) {
      await queryRunner.query(
        `UPDATE movimientos_inventario SET "almacenId" = NULL WHERE id = ANY($1::int[])`,
        [idsAlmacenId],
      );
    }
    if (idsEmpresaId.length) {
      await queryRunner.query(
        `UPDATE movimientos_inventario SET "empresaId" = NULL WHERE id = ANY($1::int[])`,
        [idsEmpresaId],
      );
    }
    await queryRunner.query(`DROP TABLE IF EXISTS _backup_fix_almacen_general`);
  }
}
