import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Elimina datos huérfanos de "empresa 2" — una empresa que NO EXISTE en la
 * tabla `empresa` (el id más bajo real es 38; probablemente borrada a mano
 * en una limpieza temprana sin cascada). Quedaron vivas filas en otras
 * tablas que nunca se limpiaron: 1 activo fijo, 2 almacenes, 1 cargo, 1
 * centro de trabajo, 2 chequeras (+ 1 cheque), 13 clientes, 22 compras
 * (+ 8 compra_detalles), 1 departamento, 1 empleado, 1 entrenador de
 * gimnasio, 1 miembro de gimnasio, 1 lista de materiales, 1 periodo de
 * nómina (+ 1 línea), 4 vínculos producto-proveedor, 24 productos, 4
 * proveedores, 1 expediente y 1 profesional de servicios profesionales —
 * y el movimiento de inventario #214 (el que disparó este diagnóstico:
 * quedó con empresaId Y almacenId NULL porque su producto es de esta
 * empresa inexistente, que además tiene 2 almacenes activos, así que no
 * hay uno único que asignarle sin adivinar — ver
 * FixAlmacenIdMovimientosInventario, que por eso lo dejó sin tocar).
 *
 * Verificado ANTES de escribir esta migración (solo lectura en
 * producción): ninguna fila de una empresa REAL referencia nada de
 * empresa 2 (se revisó productoId en movimientos_inventario,
 * compra_detalles, pre_factura_detalles, nota_debito_detalles y
 * stock_almacen, y almacenId en movimientos_inventario/stock_almacen —
 * los únicos resultados eran el propio movimiento #214, con empresaId
 * NULL, no de otra empresa). Tampoco hay FK reales declaradas desde estas
 * columnas hacia `empresa` (se confirmó contra information_schema) — por
 * eso una fila huérfana pudo sobrevivir sin que Postgres se quejara.
 *
 * Orden de borrado: hijas primero (ver el array BORRADOS, en ese orden
 * exacto) — mapeado desde las FK reales de la base, no a mano.
 *
 * Respaldo COMPLETO: cada fila eliminada se guarda entera (todas sus
 * columnas, como JSON vía row_to_json) en _respaldo_huerfanos_empresa_2
 * ANTES de borrarla (DELETE ... RETURNING * en la misma sentencia). down()
 * restaura en el orden inverso (padres primero) desde ese respaldo exacto.
 */
const BORRADOS: { tabla: string; condicion: string }[] = [
  { tabla: 'cheques', condicion: `"chequeraId" IN (SELECT id FROM chequeras WHERE "empresaId" = 2)` },
  { tabla: 'compra_detalles', condicion: `"compraId" IN (SELECT id FROM compras WHERE "empresaId" = 2)` },
  { tabla: 'nomina_lineas', condicion: `"periodoId" IN (SELECT id FROM nomina_periodos WHERE "empresaId" = 2) OR "empleadoId" IN (SELECT id FROM empleados WHERE "empresaId" = 2)` },
  { tabla: 'movimientos_inventario', condicion: `id = 214` },
  { tabla: 'producto_proveedor', condicion: `"empresaId" = 2` },
  { tabla: 'sp_expedientes', condicion: `"empresaId" = 2` },
  { tabla: 'compras', condicion: `"empresaId" = 2` },
  { tabla: 'empleados', condicion: `"empresaId" = 2` },
  { tabla: 'chequeras', condicion: `"empresaId" = 2` },
  { tabla: 'nomina_periodos', condicion: `"empresaId" = 2` },
  { tabla: 'activos_fijos', condicion: `"empresaId" = 2` },
  { tabla: 'almacenes', condicion: `"empresaId" = 2` },
  { tabla: 'cargos', condicion: `"empresaId" = 2` },
  { tabla: 'centros_trabajo', condicion: `"empresaId" = 2` },
  { tabla: 'clientes', condicion: `"empresaId" = 2` },
  { tabla: 'departamentos', condicion: `"empresaId" = 2` },
  { tabla: 'gm_entrenadores', condicion: `"empresaId" = 2` },
  { tabla: 'gm_miembros', condicion: `"empresaId" = 2` },
  { tabla: 'listas_materiales', condicion: `"empresaId" = 2` },
  { tabla: 'productos', condicion: `"empresaId" = 2` },
  { tabla: 'proveedores', condicion: `"empresaId" = 2` },
  { tabla: 'sp_profesionales', condicion: `"empresaId" = 2` },
];

export class LimpiezaHuerfanosEmpresa21770305000000 implements MigrationInterface {
  name = 'LimpiezaHuerfanosEmpresa21770305000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS _respaldo_huerfanos_empresa_2 (
        tabla VARCHAR(50)  NOT NULL,
        id    INTEGER      NOT NULL,
        datos JSONB        NOT NULL,
        fecha TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tabla, id)
      )
    `);

    for (const { tabla, condicion } of BORRADOS) {
      const filas: { id: number }[] = await queryRunner.query(`
        WITH borrados AS (
          DELETE FROM ${tabla} WHERE ${condicion}
          RETURNING *
        )
        INSERT INTO _respaldo_huerfanos_empresa_2 (tabla, id, datos)
        SELECT '${tabla}', id, row_to_json(borrados) FROM borrados
        ON CONFLICT (tabla, id) DO NOTHING
        RETURNING id
      `);
      console.log(`[LimpiezaHuerfanosEmpresa2] ${tabla}: ${filas.length} fila(s) eliminada(s) y respaldada(s)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { tabla } of [...BORRADOS].reverse()) {
      const filas: { datos: unknown }[] = await queryRunner.query(
        `SELECT datos FROM _respaldo_huerfanos_empresa_2 WHERE tabla = $1`, [tabla],
      );
      for (const { datos } of filas) {
        await queryRunner.query(
          `INSERT INTO ${tabla} SELECT * FROM json_populate_record(null::${tabla}, $1)`,
          [JSON.stringify(datos)],
        );
      }
      if (filas.length) console.log(`[LimpiezaHuerfanosEmpresa2] down(): ${tabla} — ${filas.length} fila(s) restaurada(s)`);
    }
    await queryRunner.query(`DROP TABLE IF EXISTS _respaldo_huerfanos_empresa_2`);
  }
}
