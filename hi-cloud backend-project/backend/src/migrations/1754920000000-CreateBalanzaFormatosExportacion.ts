import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla balanza_formatos_exportacion.
 *
 * Define cómo se exporta el catálogo de productos pesables hacia la balanza.
 * Cada empresa puede tener múltiples formatos (uno por modelo de balanza).
 *
 * El campo `columnas` (JSONB) es un array de descriptores:
 *   [
 *     { "campo": "plu",    "titulo": "PLU",    "ancho": 6 },
 *     { "campo": "nombre", "titulo": "NOMBRE", "ancho": 20 },
 *     { "campo": "precio", "titulo": "PRECIO", "ancho": 10 }
 *   ]
 *   Campos válidos: plu | nombre | precio | iva | categoria | codigo | codigoBarras
 *
 * Columnas
 * ────────
 * nombre        VARCHAR(100)  – etiqueta legible: "Formato Mettler Toledo"
 * formato       VARCHAR(20)   – 'CSV' | 'TXT' | 'XLS'
 * separador     VARCHAR(5)    – separador de columnas (CSV: ',' | ';' | '\t')
 * limiteNombre  SMALLINT      – max caracteres del nombre de producto
 * codificacion  VARCHAR(20)   – 'UTF-8' | 'ISO-8859-1' | 'Windows-1252'
 * columnas      JSONB         – definición de columnas (array, ver arriba)
 */
export class CreateBalanzaFormatosExportacion1754920000000 implements MigrationInterface {
  name = 'CreateBalanzaFormatosExportacion1754920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS balanza_formatos_exportacion (
        id              SERIAL        PRIMARY KEY,
        "isActive"      BOOLEAN       NOT NULL DEFAULT TRUE,
        "createdAt"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "empresaId"     INTEGER       NOT NULL,

        nombre          VARCHAR(100)  NOT NULL,
        formato         VARCHAR(20)   NOT NULL DEFAULT 'CSV',
        separador       VARCHAR(5)        NULL,
        "limiteNombre"  SMALLINT      NOT NULL DEFAULT 20,
        codificacion    VARCHAR(20)   NOT NULL DEFAULT 'UTF-8',
        columnas        JSONB         NOT NULL DEFAULT '[]',

        CONSTRAINT "CK_bfe_formato"
          CHECK (formato IN ('CSV', 'TXT', 'XLS')),
        CONSTRAINT "CK_bfe_codificacion"
          CHECK (codificacion IN ('UTF-8', 'ISO-8859-1', 'Windows-1252')),
        CONSTRAINT "CK_bfe_limiteNombre"
          CHECK ("limiteNombre" BETWEEN 5 AND 200)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bfe_empresa"
      ON balanza_formatos_exportacion ("empresaId", "isActive")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP TABLE IF EXISTS balanza_formatos_exportacion CASCADE`);
  }
}
