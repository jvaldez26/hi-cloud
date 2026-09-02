import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Descuentos en cotización, pro-forma y pre-factura — el MISMO modelo que la
 * factura, no uno parecido.
 *
 * Hasta ahora ninguno de los tres tenía descuento, ni por línea ni general. El
 * POS lo metía dentro del `precioUnitario` que enviaba, así que el importe salía
 * bien (desde `7113951d`) pero el descuento era invisible: el cliente veía un
 * total ya rebajado sin saber que se le había hecho una concesión.
 *
 * Se replican las columnas de factura una a una para que convertir una
 * cotización en factura no mueva el total:
 *
 *   por línea    descuentoPct   NUMERIC(5,2)   — convención A: % sobre el bruto
 *                descuentoMonto NUMERIC(12,4)  — A: total de la línea
 *                                                B (POS): importe POR UNIDAD
 *                precioOriginal                — presente ⇒ convención B
 *
 *   cabecera     descuentoGeneralTipo  'monto' | 'porcentaje'
 *                descuentoGeneralValor NUMERIC(12,4) en BASE imponible
 *                descuentoGeneralFinal NUMERIC(12,2) c/ITBIS, solo para imprimir
 *
 * Por qué 4 decimales en descuentoMonto y descuentoGeneralValor: el importe sale
 * de dividir entre (1 + ITBIS) lo que teclea el cajero en pesos finales
 * (10 / 1.18 = 8.4746). Con 2 decimales el documento muestra 9.99 donde se
 * pactaron 10.00. Es la misma razón por la que ya son NUMERIC(12,4) en
 * factura_detalles y facturas.
 *
 * `precioOriginal` se crea con 4 decimales, no con 2 como en `factura_detalles`.
 * Allí los 2 decimales son una deuda conocida —el POS envía 4 y se pierden al
 * guardar, ver docs/estado-actual.md—; en columnas nuevas y vacías no hay
 * motivo para heredarla.
 *
 * Nombres en camelCase y entrecomillados: las entidades no usan NamingStrategy,
 * así que snake_case aquí rompería el backend con "la columna no existe".
 */
export class AddDescuentosADocumentosComerciales1762100000000 implements MigrationInterface {
  name = 'AddDescuentosADocumentosComerciales1762100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Cotización ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "cotizacion_detalles"
        ADD COLUMN IF NOT EXISTS "descuentoPct"   NUMERIC(5,2)  NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "descuentoMonto" NUMERIC(12,4) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "precioOriginal" NUMERIC(12,4) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "cotizaciones"
        ADD COLUMN IF NOT EXISTS "descuentoGeneralTipo"  VARCHAR(10)   DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "descuentoGeneralValor" NUMERIC(12,4) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "descuentoGeneralFinal" NUMERIC(12,2) DEFAULT NULL
    `);

    // ── Pro-forma ───────────────────────────────────────────────────────────
    // Sus columnas se llaman distinto (precio / porcentajeItbis / itbis), pero
    // las de descuento se nombran igual que en los otros dos: son el mismo
    // concepto y las lee el mismo helper.
    await queryRunner.query(`
      ALTER TABLE "pro_forma_items"
        ADD COLUMN IF NOT EXISTS "descuentoPct"   NUMERIC(5,2)  NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "descuentoMonto" NUMERIC(12,4) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "precioOriginal" NUMERIC(12,4) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "pro_formas"
        ADD COLUMN IF NOT EXISTS "descuentoGeneralTipo"  VARCHAR(10)   DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "descuentoGeneralValor" NUMERIC(12,4) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "descuentoGeneralFinal" NUMERIC(12,2) DEFAULT NULL
    `);

    // ── Pre-factura ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "pre_factura_detalles"
        ADD COLUMN IF NOT EXISTS "descuentoPct"   NUMERIC(5,2)  NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "descuentoMonto" NUMERIC(12,4) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "precioOriginal" NUMERIC(12,4) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "pre_facturas"
        ADD COLUMN IF NOT EXISTS "descuentoGeneralTipo"  VARCHAR(10)   DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "descuentoGeneralValor" NUMERIC(12,4) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "descuentoGeneralFinal" NUMERIC(12,2) DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cotizacion_detalles"
        DROP COLUMN IF EXISTS "descuentoPct",
        DROP COLUMN IF EXISTS "descuentoMonto",
        DROP COLUMN IF EXISTS "precioOriginal"
    `);
    await queryRunner.query(`
      ALTER TABLE "cotizaciones"
        DROP COLUMN IF EXISTS "descuentoGeneralTipo",
        DROP COLUMN IF EXISTS "descuentoGeneralValor",
        DROP COLUMN IF EXISTS "descuentoGeneralFinal"
    `);
    await queryRunner.query(`
      ALTER TABLE "pro_forma_items"
        DROP COLUMN IF EXISTS "descuentoPct",
        DROP COLUMN IF EXISTS "descuentoMonto",
        DROP COLUMN IF EXISTS "precioOriginal"
    `);
    await queryRunner.query(`
      ALTER TABLE "pro_formas"
        DROP COLUMN IF EXISTS "descuentoGeneralTipo",
        DROP COLUMN IF EXISTS "descuentoGeneralValor",
        DROP COLUMN IF EXISTS "descuentoGeneralFinal"
    `);
    await queryRunner.query(`
      ALTER TABLE "pre_factura_detalles"
        DROP COLUMN IF EXISTS "descuentoPct",
        DROP COLUMN IF EXISTS "descuentoMonto",
        DROP COLUMN IF EXISTS "precioOriginal"
    `);
    await queryRunner.query(`
      ALTER TABLE "pre_facturas"
        DROP COLUMN IF EXISTS "descuentoGeneralTipo",
        DROP COLUMN IF EXISTS "descuentoGeneralValor",
        DROP COLUMN IF EXISTS "descuentoGeneralFinal"
    `);
  }
}
