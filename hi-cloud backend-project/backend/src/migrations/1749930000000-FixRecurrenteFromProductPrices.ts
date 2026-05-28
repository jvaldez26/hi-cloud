import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Segunda pasada de reparación de facturas recurrentes con montos cero.
 *
 * La migración anterior (1749920000000) copió los precios del JSON de la plantilla.
 * Esta migración cubre el caso donde la plantilla TAMBIÉN tiene precioUnitario = 0,
 * buscando el precio correcto en la tabla `productos`.
 *
 * Acciones:
 *  1. Actualiza factura_detalles con precio del producto cuando precioUnitario = 0 y productoId existe.
 *  2. Recalcula subtotal, importeIva, total de cada detalle afectado.
 *  3. Recalcula header (subtotal, iva, total) de las facturas afectadas.
 *  4. Corrige también el JSON de la plantilla (facturas_recurrentes.detalles)
 *     para que las generaciones futuras usen el precio correcto.
 *
 * IDEMPOTENTE: solo afecta registros con precioUnitario = 0 donde hay producto con precio > 0.
 */
export class FixRecurrenteFromProductPrices1749930000000 implements MigrationInterface {
  name = 'FixRecurrenteFromProductPrices1749930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 0. Diagnóstico previo ────────────────────────────────────────────────────
    const zeroPre = await queryRunner.query(`
      SELECT COUNT(DISTINCT f.id) AS facturas_cero
      FROM facturas f
      WHERE f."facturaRecurrenteId" IS NOT NULL
        AND f.total::numeric = 0
        AND f."isActive" = true
    `);
    const detallesCero = await queryRunner.query(`
      SELECT COUNT(*) AS detalles_cero
      FROM factura_detalles fd
      JOIN facturas f ON f.id = fd."facturaId"
      WHERE f."facturaRecurrenteId" IS NOT NULL
        AND fd."precioUnitario"::numeric = 0
        AND fd."isActive" = true
    `);
    console.log(
      `[FixRecurrenteFromProductPrices] Antes: ${zeroPre[0]?.facturas_cero} facturas con total=0, ` +
      `${detallesCero[0]?.detalles_cero} detalles con precioUnitario=0`,
    );

    // ── 1. Actualizar factura_detalles con precio del producto ──────────────────
    const updDetalles = await queryRunner.query(`
      UPDATE factura_detalles fd
      SET
        "precioUnitario" = p.precio,
        subtotal         = ROUND(p.precio::numeric * fd.cantidad::numeric, 2),
        "importeIva"     = ROUND(p.precio::numeric * fd.cantidad::numeric * fd."porcentajeIva"::numeric / 100, 2),
        total            = ROUND(
                             p.precio::numeric * fd.cantidad::numeric
                             * (1 + fd."porcentajeIva"::numeric / 100),
                             2)
      FROM productos p
      JOIN facturas f ON f.id = fd."facturaId"
      WHERE fd."productoId" IS NOT NULL
        AND fd."precioUnitario"::numeric = 0
        AND p.id = fd."productoId"
        AND p."isActive" = true
        AND p.precio::numeric > 0
        AND f."facturaRecurrenteId" IS NOT NULL
        AND f."isActive" = true
        AND fd."isActive" = true
    `);
    console.log(`[FixRecurrenteFromProductPrices] Detalles actualizados: ${(updDetalles as any)?.rowCount ?? '?'}`);

    // ── 2. Recalcular header de facturas afectadas ───────────────────────────────
    const updHeaders = await queryRunner.query(`
      UPDATE facturas f
      SET
        subtotal = sub.subtotal,
        iva      = sub.iva,
        total    = sub.total
      FROM (
        SELECT
          "facturaId",
          ROUND(COALESCE(SUM(subtotal),     0), 2) AS subtotal,
          ROUND(COALESCE(SUM("importeIva"), 0), 2) AS iva,
          ROUND(COALESCE(SUM(total),        0), 2) AS total
        FROM factura_detalles
        WHERE "isActive" = true
        GROUP BY "facturaId"
      ) sub
      WHERE f.id = sub."facturaId"
        AND f."facturaRecurrenteId" IS NOT NULL
        AND f."isActive" = true
        AND sub.total > 0
    `);
    console.log(`[FixRecurrenteFromProductPrices] Headers recalculados: ${(updHeaders as any)?.rowCount ?? '?'}`);

    // ── 3. Reparar el JSON de la plantilla para futuras generaciones ────────────
    //    Para cada ítem del JSON con precioUnitario = 0 y productoId existe en productos,
    //    actualizar precioUnitario con el valor del producto.
    await queryRunner.query(`
      UPDATE facturas_recurrentes fr
      SET detalles = fixed.detalles
      FROM (
        SELECT
          fr2.id,
          jsonb_agg(
            CASE
              WHEN (elem->>'productoId') IS NOT NULL
                AND (COALESCE(elem->>'precioUnitario', '0'))::numeric = 0
                AND p.precio::numeric > 0
              THEN jsonb_set(
                     jsonb_set(elem, '{precioUnitario}', to_jsonb(p.precio::numeric)),
                     '{porcentajeIva}', to_jsonb(p."porcentajeIva"::numeric)
                   )
              ELSE elem
            END
            ORDER BY ordinality
          ) AS detalles
        FROM facturas_recurrentes fr2,
             LATERAL jsonb_array_elements(fr2.detalles::jsonb)
                     WITH ORDINALITY AS t(elem, ordinality)
        LEFT JOIN productos p
               ON p.id = (elem->>'productoId')::integer
              AND p."isActive" = true
        WHERE fr2."isActive" = true
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(fr2.detalles::jsonb) e2
            WHERE (COALESCE(e2->>'precioUnitario', '0'))::numeric = 0
              AND (e2->>'productoId') IS NOT NULL
          )
        GROUP BY fr2.id
      ) fixed
      WHERE fr.id = fixed.id
    `);

    // ── 4. Diagnóstico posterior ────────────────────────────────────────────────
    const zeroPost = await queryRunner.query(`
      SELECT COUNT(DISTINCT f.id) AS facturas_cero
      FROM facturas f
      WHERE f."facturaRecurrenteId" IS NOT NULL
        AND f.total::numeric = 0
        AND f."isActive" = true
    `);
    console.log(
      `[FixRecurrenteFromProductPrices] Después: ${zeroPost[0]?.facturas_cero} facturas con total=0. ✅`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    console.log('[FixRecurrenteFromProductPrices] down() — no se puede revertir automáticamente.');
  }
}
