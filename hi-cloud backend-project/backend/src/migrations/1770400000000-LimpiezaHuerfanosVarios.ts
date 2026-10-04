import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Elimina datos huérfanos de SEIS empresas que NO EXISTEN en la tabla
 * `empresa` (37, 1, 28, 29, 39, 33) — descubiertas en la auditoría completa
 * de 333 tablas con columna empresaId que siguió a la limpieza de la
 * "empresa 2" (ver LimpiezaHuerfanosEmpresa2, 1770305000000). Mismo origen
 * probable: compañías de prueba borradas a mano en algún punto, sin cascada.
 *
 * Verificado ANTES de escribir esta migración (solo lectura en producción,
 * mismo método que para empresa 2 — con el cuidado de nunca usar sólo
 * "IS DISTINCT FROM", que da falso positivo con NULL):
 *   - Ninguna fila de una empresa REAL referencia a estas seis: se revisó
 *     cruzado productoId/almacenId/clienteId/proveedorId/compraId contra
 *     movimientos_inventario, compra_detalles, stock_almacen,
 *     producto_proveedor, facturas.clienteId, cotizaciones.clienteId y
 *     compras.proveedorId — cero coincidencias con empresaId real distinto.
 *   - Las 3 filas de pre_factura_detalles y las 2 de nota_credito_detalles
 *     que apuntan a productos de la empresa 37 tienen su registro padre
 *     (pre_facturas / notas_credito) YA INEXISTENTE (preFacturaId/
 *     notaCreditoId no resuelven a ninguna fila viva) — están huérfanas
 *     ellas mismas, no pertenecen a ninguna empresa real.
 *   - Para la empresa 37 (Prestamista, pr_deudores #2) se revisaron las 10
 *     tablas pr_* del módulo (cobranzas, cuotas, deudores, garantes,
 *     garantías, pagos, préstamos, productos de préstamo, refinanciamientos,
 *     solicitudes, vehículos): solo pr_deudores tiene la fila huérfana (1);
 *     el resto no tiene ninguna fila colgando de ese deudor.
 *
 * Conteo exacto verificado en producción (solo lectura, mismas condiciones
 * que usa esta migración) ANTES de escribirla — 48 filas, 12 tablas:
 *   stock_almacen: 2 · compra_detalles: 3 · pre_factura_detalles: 3 ·
 *   nota_credito_detalles: 2 · producto_proveedor: 1 · compras: 3 ·
 *   productos: 17 · almacenes: 5 · clientes: 8 · proveedores: 2 ·
 *   suscripciones: 1 · pr_deudores: 1
 * Por empresa huérfana (de esos mismos 48):
 *   empresaId=1:  1 almacén, 2 productos, 1 suscripción
 *   empresaId=28: 1 almacén, 1 cliente, 1 producto
 *   empresaId=29: 1 almacén, 1 producto
 *   empresaId=33: 1 cliente
 *   empresaId=37: 1 almacén, 5 clientes, 3 compras, 1 deudor (Prestamista),
 *                 1 producto_proveedor, 12 productos, 2 proveedores
 *   empresaId=39: 1 almacén, 1 cliente, 1 producto
 * (stock_almacen/compra_detalles/pre_factura_detalles/nota_credito_detalles
 * se cuentan por producto/almacén/compra enlazado, no por su propio
 * empresaId — ver empresaIdExpr de cada entrada de BORRADOS).
 *
 * Orden de borrado: hijas primero (mapeado desde las FK reales declaradas en
 * la base vía information_schema, no a mano) — stock_almacen/compra_detalles/
 * pre_factura_detalles/nota_credito_detalles/producto_proveedor antes que
 * compras/productos/almacenes, y estos antes que clientes/proveedores/
 * suscripciones/pr_deudores.
 *
 * Respaldo COMPLETO (row_to_json) en _respaldo_huerfanos (tabla, id,
 * empresaIdOriginal, datos, fecha) — distinto de _respaldo_huerfanos_empresa_2
 * porque aquí conviven VARIAS empresaId huérfanas en la misma tabla de
 * respaldo. empresaIdOriginal se resuelve por COALESCE contra la propia
 * columna empresaId de la fila (cuando la tiene) o contra el padre todavía
 * vivo en ese momento del borrado (producto/almacén/compra) — por eso las
 * tablas hijas se borran ANTES que sus padres. down() restora en el orden
 * inverso (padres primero) desde ese respaldo exacto.
 */
const ORPHAN_IDS = [37, 1, 28, 29, 39, 33];
const IDS_SQL = `ARRAY[${ORPHAN_IDS.join(',')}]`;

const BORRADOS: { tabla: string; condicion: string; empresaIdExpr: string }[] = [
  {
    tabla: 'stock_almacen',
    condicion: `
      "empresaId" = ANY(${IDS_SQL})
      OR "productoId" IN (SELECT id FROM productos WHERE "empresaId" = ANY(${IDS_SQL}))
      OR "almacenId" IN (SELECT id FROM almacenes WHERE "empresaId" = ANY(${IDS_SQL}))
    `,
    empresaIdExpr: `COALESCE(
      borrados."empresaId",
      (SELECT "empresaId" FROM productos WHERE id = borrados."productoId"),
      (SELECT "empresaId" FROM almacenes WHERE id = borrados."almacenId")
    )`,
  },
  {
    tabla: 'compra_detalles',
    condicion: `
      "compraId" IN (SELECT id FROM compras WHERE "empresaId" = ANY(${IDS_SQL}))
      OR "productoId" IN (SELECT id FROM productos WHERE "empresaId" = ANY(${IDS_SQL}))
    `,
    empresaIdExpr: `COALESCE(
      (SELECT "empresaId" FROM compras WHERE id = borrados."compraId"),
      (SELECT "empresaId" FROM productos WHERE id = borrados."productoId")
    )`,
  },
  {
    tabla: 'pre_factura_detalles',
    condicion: `"productoId" IN (SELECT id FROM productos WHERE "empresaId" = ANY(${IDS_SQL}))`,
    empresaIdExpr: `(SELECT "empresaId" FROM productos WHERE id = borrados."productoId")`,
  },
  {
    tabla: 'nota_credito_detalles',
    condicion: `"productoId" IN (SELECT id FROM productos WHERE "empresaId" = ANY(${IDS_SQL}))`,
    empresaIdExpr: `(SELECT "empresaId" FROM productos WHERE id = borrados."productoId")`,
  },
  {
    tabla: 'producto_proveedor',
    condicion: `"empresaId" = ANY(${IDS_SQL})`,
    empresaIdExpr: `borrados."empresaId"`,
  },
  {
    tabla: 'compras',
    condicion: `"empresaId" = ANY(${IDS_SQL})`,
    empresaIdExpr: `borrados."empresaId"`,
  },
  {
    tabla: 'productos',
    condicion: `"empresaId" = ANY(${IDS_SQL})`,
    empresaIdExpr: `borrados."empresaId"`,
  },
  {
    tabla: 'almacenes',
    condicion: `"empresaId" = ANY(${IDS_SQL})`,
    empresaIdExpr: `borrados."empresaId"`,
  },
  {
    tabla: 'clientes',
    condicion: `"empresaId" = ANY(${IDS_SQL})`,
    empresaIdExpr: `borrados."empresaId"`,
  },
  {
    tabla: 'proveedores',
    condicion: `"empresaId" = ANY(${IDS_SQL})`,
    empresaIdExpr: `borrados."empresaId"`,
  },
  {
    tabla: 'suscripciones',
    condicion: `"empresaId" = ANY(${IDS_SQL})`,
    empresaIdExpr: `borrados."empresaId"`,
  },
  {
    tabla: 'pr_deudores',
    condicion: `"empresaId" = ANY(${IDS_SQL})`,
    empresaIdExpr: `borrados."empresaId"`,
  },
];

export class LimpiezaHuerfanosVarios1770400000000 implements MigrationInterface {
  name = 'LimpiezaHuerfanosVarios1770400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS _respaldo_huerfanos (
        tabla             VARCHAR(50)  NOT NULL,
        id                INTEGER      NOT NULL,
        "empresaIdOriginal" INTEGER,
        datos             JSONB        NOT NULL,
        fecha             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tabla, id)
      )
    `);

    for (const { tabla, condicion, empresaIdExpr } of BORRADOS) {
      const filas: { id: number }[] = await queryRunner.query(`
        WITH borrados AS (
          DELETE FROM ${tabla} WHERE ${condicion}
          RETURNING *
        )
        INSERT INTO _respaldo_huerfanos (tabla, id, "empresaIdOriginal", datos)
        SELECT '${tabla}', borrados.id, ${empresaIdExpr}, row_to_json(borrados) FROM borrados
        ON CONFLICT (tabla, id) DO NOTHING
        RETURNING id
      `);
      console.log(`[LimpiezaHuerfanosVarios] ${tabla}: ${filas.length} fila(s) eliminada(s) y respaldada(s)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // _respaldo_huerfanos es una tabla genérica (pensada para reutilizarse en
    // futuras limpiezas de huérfanos) — down() solo borra las filas que ESTA
    // migración insertó (tabla + id ya conocidos de BORRADOS), nunca la tabla
    // completa, para no arrastrarse el respaldo de alguna limpieza futura.
    for (const { tabla } of [...BORRADOS].reverse()) {
      const filas: { id: number; datos: unknown }[] = await queryRunner.query(
        `SELECT id, datos FROM _respaldo_huerfanos WHERE tabla = $1`, [tabla],
      );
      for (const { datos } of filas) {
        await queryRunner.query(
          `INSERT INTO ${tabla} SELECT * FROM json_populate_record(null::${tabla}, $1)`,
          [JSON.stringify(datos)],
        );
      }
      if (filas.length) {
        await queryRunner.query(
          `DELETE FROM _respaldo_huerfanos WHERE tabla = $1 AND id = ANY($2)`,
          [tabla, filas.map(f => f.id)],
        );
        console.log(`[LimpiezaHuerfanosVarios] down(): ${tabla} — ${filas.length} fila(s) restaurada(s)`);
      }
    }
  }
}
