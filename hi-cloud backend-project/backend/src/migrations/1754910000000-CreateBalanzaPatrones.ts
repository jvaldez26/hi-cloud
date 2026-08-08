import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla balanza_patrones.
 *
 * Un patrón describe cómo interpretar el código de barras que imprime una balanza
 * etiquetadora. Es 100 % configurable: sin hardcodear ningún modelo específico.
 *
 * Geometría de un EAN-13 de balanza:
 *   [prefijo] [PLU] [valor_con_o_sin_check] [check EAN]
 *   ───────── ───── ──────────────────────── ──────────
 *    prefijo   PLU           valor               1 dígito
 *   (1-2 dig) (4-6 dig)   (longitudValor dig)
 *
 *   prefijo.length + longitudPlu + longitudValor + 1 = longitudTotal (12 o 13)
 *
 * Columnas
 * ────────
 * nombre          VARCHAR(100)  – etiqueta legible: "Mettler Toledo 5-PLU peso"
 * prefijo         VARCHAR(4)    – '2', '20'…'29'
 * longitudPlu     SMALLINT      – dígitos del PLU: 4, 5 o 6
 * tipoDato        VARCHAR(10)   – 'peso' | 'precio'
 * longitudValor   SMALLINT      – dígitos del campo valor
 *                                 (incluye check interno si tieneCheckValor = true)
 * decimalesValor  SMALLINT      – decimales al interpretar el campo valor
 *                                 Ej: 003500 con decimales=3 → 3.500
 * unidadPeso      VARCHAR(20)   – código UOM esperado: 'KG', 'LB', etc.
 *                                 NULL cuando tipoDato = 'precio'
 * tieneCheckValor BOOLEAN       – el último dígito de longitudValor es un check
 *                                 interno (dígito suma simple mod-10).
 * longitudTotal   SMALLINT      – longitud total del código: 12 (UPC-A) | 13 (EAN-13)
 * prioridad       SMALLINT      – resolución de conflicto: el patrón con prioridad
 *                                 más baja gana. DEFAULT 100.
 *
 * La columna isActive (heredada de BaseEntity vía TypeORM) funciona como
 * eliminación lógica. Para deshabilitar temporalmente un patrón, usar isActive=false.
 */
export class CreateBalanzaPatrones1754910000000 implements MigrationInterface {
  name = 'CreateBalanzaPatrones1754910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS balanza_patrones (
        id               SERIAL       PRIMARY KEY,
        "isActive"       BOOLEAN      NOT NULL DEFAULT TRUE,
        "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "empresaId"      INTEGER      NOT NULL,

        nombre           VARCHAR(100) NOT NULL,
        prefijo          VARCHAR(4)   NOT NULL,
        "longitudPlu"    SMALLINT     NOT NULL,
        "tipoDato"       VARCHAR(10)  NOT NULL DEFAULT 'peso',
        "longitudValor"  SMALLINT     NOT NULL,
        "decimalesValor" SMALLINT     NOT NULL DEFAULT 3,
        "unidadPeso"     VARCHAR(20)      NULL,
        "tieneCheckValor" BOOLEAN     NOT NULL DEFAULT FALSE,
        "longitudTotal"  SMALLINT     NOT NULL DEFAULT 13,
        prioridad        SMALLINT     NOT NULL DEFAULT 100,

        CONSTRAINT "CK_bp_tipoDato"
          CHECK ("tipoDato" IN ('peso', 'precio')),
        CONSTRAINT "CK_bp_longitudTotal"
          CHECK ("longitudTotal" IN (12, 13)),
        CONSTRAINT "CK_bp_longitudPlu"
          CHECK ("longitudPlu" BETWEEN 4 AND 6),
        CONSTRAINT "CK_bp_decimales"
          CHECK ("decimalesValor" BETWEEN 0 AND 6),
        CONSTRAINT "CK_bp_longitudValor"
          CHECK ("longitudValor" BETWEEN 3 AND 8),
        CONSTRAINT "CK_bp_geometria"
          CHECK (LENGTH(prefijo) + "longitudPlu" + "longitudValor" + 1 = "longitudTotal")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bp_empresa"
      ON balanza_patrones ("empresaId", "isActive")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`DROP TABLE IF EXISTS balanza_patrones CASCADE`);
  }
}
