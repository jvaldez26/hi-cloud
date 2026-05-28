import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Segunda pasada de reparación de facturas recurrentes con montos cero.
 *
 * La migración anterior (1749920000000) copió los precios del JSON de la plantilla.
 * Esta cubre el caso donde la plantilla TAMBIÉN tiene precioUnitario = 0,
 * buscando el precio correcto en la tabla `productos`.
 *
 * Acciones:
 *  1. Actualiza factura_detalles con precio del producto cuando precioUnitario = 0 y productoId existe.
 *  2. Recalcula subtotal / importeIva / total de cada detalle afectado.
 *  3. Recalcula header (subtotal, iva, total) de las facturas afectadas.
 *  4. Repara el JSON de las plantillas via DO $$ para futura idempotencia.
 *
 * IDEMPOTENTE: solo afecta registros con precioUnitario = 0 donde hay producto con precio > 0.
 */
export class FixRecurrenteFromProductPrices1749930000000 implements MigrationInterface {
  name = 'FixRecurrenteFromProductPrices1749930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 0. Diagnóstico previo ───────────────────────────────────────────────────
    const zeroPre = await queryRunner.query(`
      SELECT COUNT(DISTINCT f.id)::int AS facturas_cero
      FROM facturas f
      WHERE f."facturaRecurrenteId" IS NOT NULL
        AND f.total::numeric = 0
        AND f."isActive" = true
    `);
    console.log(
      `[FixRecurrenteFromProductPrices] Antes: ${zeroPre[0]?.facturas_cero ?? 0} facturas con total=0`,
    );

    // ── 1. Actualizar factura_detalles (precio del producto) ────────────────────
    await queryRunner.query(`
      UPDATE factura_detalles fd
      SET
        "precioUnitario" = p.precio,
        subtotal         = ROUND(p.precio::numeric * fd.cantidad::numeric, 2),
        "importeIva"     = ROUND(p.precio::numeric * fd.cantidad::numeric
                                 * fd."porcentajeIva"::numeric / 100, 2),
        total            = ROUND(p.precio::numeric * fd.cantidad::numeric
                                 * (1 + fd."porcentajeIva"::numeric / 100), 2)
      FROM productos p
      JOIN facturas f ON f.id = fd."facturaId"
      WHERE fd."productoId" IS NOT NULL
        AND fd."precioUnitario"::numeric = 0
        AND p.id         = fd."productoId"
        AND p."isActive" = true
        AND p.precio::numeric > 0
        AND f."facturaRecurrenteId" IS NOT NULL
        AND f."isActive" = true
        AND fd."isActive" = true
    `);

    // ── 2. Recalcular headers de facturas afectadas ────────────────────────────
    await queryRunner.query(`
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
      WHERE f.id                      = sub."facturaId"
        AND f."facturaRecurrenteId"   IS NOT NULL
        AND f."isActive"              = true
        AND sub.total                 > 0
    `);

    // ── 3. Reparar JSON de las plantillas (via PL/pgSQL para evitar LATERAL bugs) ─
    await queryRunner.query(`
      DO $$
      DECLARE
        tmpl   RECORD;
        item   JSONB;
        prod   RECORD;
        nuevo  JSONB;
        i      INT;
      BEGIN
        FOR tmpl IN
          SELECT id, detalles::jsonb AS d
          FROM   facturas_recurrentes
          WHERE  "isActive" = true
            AND  detalles IS NOT NULL
        LOOP
          nuevo := '[]'::jsonb;
          FOR i IN 0 .. jsonb_array_length(tmpl.d) - 1 LOOP
            item := tmpl.d -> i;
            IF (item->>'productoId') IS NOT NULL
               AND COALESCE((item->>'precioUnitario')::numeric, 0) = 0 THEN
              BEGIN
                SELECT precio, "porcentajeIva"
                  INTO prod
                  FROM productos
                 WHERE id          = (item->>'productoId')::int
                   AND "isActive"  = true
                   AND precio::numeric > 0
                 LIMIT 1;
                IF FOUND THEN
                  item := jsonb_set(item, '{precioUnitario}', to_jsonb(prod.precio::numeric));
                  item := jsonb_set(item, '{porcentajeIva}',  to_jsonb(prod."porcentajeIva"::numeric));
                END IF;
              EXCEPTION WHEN OTHERS THEN
                NULL;  -- ignorar filas con productoId inválido
              END;
            END IF;
            nuevo := nuevo || item;
          END LOOP;
          UPDATE facturas_recurrentes SET detalles = nuevo WHERE id = tmpl.id;
        END LOOP;
      END $$
    `);

    // ── 4. Diagnóstico posterior ───────────────────────────────────────────────
    const zeroPost = await queryRunner.query(`
      SELECT COUNT(DISTINCT f.id)::int AS facturas_cero
      FROM facturas f
      WHERE f."facturaRecurrenteId" IS NOT NULL
        AND f.total::numeric = 0
        AND f."isActive" = true
    `);
    console.log(
      `[FixRecurrenteFromProductPrices] Después: ${zeroPost[0]?.facturas_cero ?? 0} facturas con total=0. ✅`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    console.log('[FixRecurrenteFromProductPrices] down() — no reversible automáticamente.');
  }
}
