import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo de costos de importación.
 *
 * Antes de ejecutar en producción, verificar:
 *   SELECT COUNT(*) FROM compra_detalles;
 *
 * El ADD COLUMN con DEFAULT en PostgreSQL 11+ es instantáneo (no reescribe filas).
 * SET LOCAL lock_timeout = '3s' protege contra espera prolongada de bloqueo.
 */
export class GastosImportacion1755610000000 implements MigrationInterface {
  name = 'GastosImportacion1755610000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);

    // ── Tabla principal ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "gastos_importacion" (
        "id"                  SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL,
        "compraId"            INTEGER NOT NULL,
        "embarqueId"          INTEGER,
        "concepto"            VARCHAR(200) NOT NULL,
        "tipo"                VARCHAR(20)  NOT NULL,
        "monto"               DECIMAL(12,2) NOT NULL,
        "moneda"              VARCHAR(3)   NOT NULL DEFAULT 'DOP',
        "tipoCambio"          DECIMAL(10,4) NOT NULL DEFAULT 1,
        "montoDOP"            DECIMAL(12,2) NOT NULL,
        "criterioProrrateo"   VARCHAR(20)  NOT NULL DEFAULT 'valor_fob',
        "estado"              VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
        "ajusteRetroactivo"   BOOLEAN      NOT NULL DEFAULT FALSE,
        "motivoAjuste"        TEXT,
        "aplicadoAt"          TIMESTAMP WITH TIME ZONE,
        "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "fk_gi_compra"  FOREIGN KEY ("compraId")  REFERENCES "compras"("id") ON DELETE CASCADE
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_gi_compra"  ON "gastos_importacion" ("compraId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_gi_empresa" ON "gastos_importacion" ("empresaId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_gi_estado"  ON "gastos_importacion" ("estado")`);

    // ── Líneas de distribución por ítem de compra ─────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "gastos_importacion_lineas" (
        "id"                  SERIAL PRIMARY KEY,
        "gastoImportacionId"  INTEGER      NOT NULL,
        "compraDetalleId"     INTEGER      NOT NULL,
        "montoAsignado"       DECIMAL(12,4) NOT NULL DEFAULT 0,
        "montoUnitario"       DECIMAL(12,4) NOT NULL DEFAULT 0,
        "ajusteManual"        BOOLEAN      NOT NULL DEFAULT FALSE,
        CONSTRAINT "fk_gil_gasto"   FOREIGN KEY ("gastoImportacionId") REFERENCES "gastos_importacion"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_gil_detalle" FOREIGN KEY ("compraDetalleId")    REFERENCES "compra_detalles"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_gil_gasto_detalle" UNIQUE ("gastoImportacionId", "compraDetalleId")
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_gil_gasto"   ON "gastos_importacion_lineas" ("gastoImportacionId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_gil_detalle" ON "gastos_importacion_lineas" ("compraDetalleId")`);

    // ── Campo acumulador en compra_detalles ───────────────────────────────────
    // Suma de costoImportacionUnitario de todos los gastos aplicados a esta línea.
    // costoUnitarioReal + costoImportacionUnitario = costo landing real → AVCO.
    await qr.query(`
      ALTER TABLE "compra_detalles"
        ADD COLUMN IF NOT EXISTS "costoImportacionUnitario" DECIMAL(12,4) NOT NULL DEFAULT 0
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "compra_detalles" DROP COLUMN IF EXISTS "costoImportacionUnitario"`);
    await qr.query(`DROP TABLE IF EXISTS "gastos_importacion_lineas"`);
    await qr.query(`DROP TABLE IF EXISTS "gastos_importacion"`);
  }
}
