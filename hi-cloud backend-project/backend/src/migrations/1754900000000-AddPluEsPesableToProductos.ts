import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega soporte de balanzas etiquetadoras a productos:
 *
 * - plu INTEGER NULL
 *   Código PLU (Product Lookup Unit) que la balanza graba en el código de barras.
 *   Único por empresa entre productos activos — índice parcial.
 *   NULL si el producto no es pesable / no usa balanza.
 *
 * - esPesable BOOLEAN NOT NULL DEFAULT FALSE
 *   Indica que el producto se despacha por peso y puede llegar desde una balanza.
 *   Cuando es true, unidadMedida debe ser una unidad de peso con permiteDecimales=true.
 *
 * NOTAS TÉCNICAS
 * - ADD COLUMN INTEGER NULL: sin reescritura de tabla (PG 11+).
 * - ADD COLUMN BOOLEAN NOT NULL DEFAULT false: se almacena en catálogo en PG 11+,
 *   tampoco requiere reescritura. Para tablas grandes es instantáneo.
 * - CREATE UNIQUE INDEX sin CONCURRENTLY: toma un ShareLock breve. Para tablas
 *   pequeñas (< 500 k filas) el lock es de milisegundos. Si la tabla es grande,
 *   extraer el CREATE INDEX a una migración separada con CONCURRENTLY fuera de
 *   transacción y desactivar transacciones en esa migración.
 * - SET LOCAL lock_timeout = '3s' protege contra bloqueos largos en producción.
 */
export class AddPluEsPesableToProductos1754900000000 implements MigrationInterface {
  name = 'AddPluEsPesableToProductos1754900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      ALTER TABLE productos
        ADD COLUMN IF NOT EXISTS plu        INTEGER     NULL,
        ADD COLUMN IF NOT EXISTS "esPesable" BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // Índice único parcial: ninguna empresa puede tener dos productos activos
    // con el mismo PLU. Los productos sin PLU (plu IS NULL) quedan excluidos.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_productos_plu_empresa"
      ON productos (plu, "empresaId")
      WHERE plu IS NOT NULL AND "isActive" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP INDEX  IF EXISTS "UQ_productos_plu_empresa"`);
    await queryRunner.query(`ALTER TABLE productos DROP COLUMN IF EXISTS plu`);
    await queryRunner.query(`ALTER TABLE productos DROP COLUMN IF EXISTS "esPesable"`);
  }
}
