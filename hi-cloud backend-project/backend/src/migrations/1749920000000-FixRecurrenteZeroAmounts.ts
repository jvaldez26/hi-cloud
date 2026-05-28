import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repara facturas generadas por plantillas recurrentes que tienen total = 0.
 *
 * Causa: un bug en la versión anterior del servicio donde los valores numéricos
 * del JSON de la plantilla no se parseaban correctamente, resultando en precios = 0.
 *
 * La corrección usa los precios del JSON original de la plantilla (facturas_recurrentes.detalles)
 * para recalcular los importes de cada factura_detalle, luego actualiza el header de la factura.
 *
 * Es IDEMPOTENTE: solo afecta facturas con total = 0 vinculadas a una plantilla recurrente.
 */
export class FixRecurrenteZeroAmounts1749920000000 implements MigrationInterface {
  name = 'FixRecurrenteZeroAmounts1749920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Verificar cuántas facturas afectadas ─────────────────────────────────
    const affected = await queryRunner.query(`
      SELECT COUNT(*) AS total
      FROM facturas f
      JOIN facturas_recurrentes fr ON fr.id = f."facturaRecurrenteId"
      WHERE f."facturaRecurrenteId" IS NOT NULL
        AND f.total::numeric = 0
        AND f."isActive" = true
        AND fr."isActive" = true
    `);
    const total = Number(affected[0]?.total ?? 0);
    if (total === 0) {
      console.log('[FixRecurrenteZeroAmounts] No hay facturas con monto cero — nada que corregir.');
      return;
    }
    console.log(`[FixRecurrenteZeroAmounts] Corrigiendo ${total} factura(s) con monto cero...`);

    // ── 2. Actualizar factura_detalles desde el JSON de la plantilla ────────────
    //    Usa jsonb_array_elements WITH ORDINALITY para obtener la posición de cada
    //    ítem en el array, y ROW_NUMBER() para hacer match con los detalles guardados
    //    (que se insertaron en el mismo orden que el array JSON).
    await queryRunner.query(`
      WITH template_detalles AS (
        SELECT
          f.id                                                          AS factura_id,
          COALESCE((td.value->>'precioUnitario')::numeric,
                   (td.value->>'precio')::numeric, 0)                  AS precio,
          COALESCE((td.value->>'cantidad')::numeric, 1)                AS cantidad,
          COALESCE((td.value->>'porcentajeIva')::numeric, 0)           AS pct_iva,
          td.ordinality                                                 AS pos
        FROM facturas f
        JOIN facturas_recurrentes fr ON fr.id = f."facturaRecurrenteId"
        CROSS JOIN LATERAL jsonb_array_elements(fr.detalles::jsonb)
                           WITH ORDINALITY AS td(value, ordinality)
        WHERE f."facturaRecurrenteId" IS NOT NULL
          AND f.total::numeric = 0
          AND f."isActive"  = true
          AND fr."isActive" = true
      ),
      factura_detalle_ordenado AS (
        SELECT
          fd.id          AS detalle_id,
          fd."facturaId",
          ROW_NUMBER() OVER (PARTITION BY fd."facturaId" ORDER BY fd.id ASC) AS pos
        FROM factura_detalles fd
        WHERE fd."facturaId" IN (SELECT DISTINCT factura_id FROM template_detalles)
      )
      UPDATE factura_detalles fd
      SET
        "precioUnitario" = td.precio,
        cantidad         = td.cantidad::integer,
        "porcentajeIva"  = td.pct_iva,
        subtotal         = ROUND(td.precio * td.cantidad, 2),
        "importeIva"     = ROUND(td.precio * td.cantidad * td.pct_iva / 100, 2),
        total            = ROUND(td.precio * td.cantidad * (1 + td.pct_iva / 100), 2)
      FROM template_detalles td
      JOIN factura_detalle_ordenado fdo
        ON fdo."facturaId" = td.factura_id AND fdo.pos = td.pos
      WHERE fd.id = fdo.detalle_id
    `);

    // ── 3. Recalcular header de la factura desde los detalles ya corregidos ─────
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
      WHERE f.id = sub."facturaId"
        AND f."facturaRecurrenteId" IS NOT NULL
        AND f."isActive" = true
    `);

    console.log(`[FixRecurrenteZeroAmounts] ✅ ${total} factura(s) corregidas.`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No reversible: no se puede saber cuáles facturas tenían 0 antes de la corrección
    console.log('[FixRecurrenteZeroAmounts] down() — no se puede revertir automáticamente.');
  }
}
