import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea tabla 'bancos_conciliacion' para el módulo de Bancos.
 *
 * PROBLEMA RAÍZ: bancos y tesorería compartían la misma tabla 'movimientos_bancarios'
 * con esquemas incompatibles (cuentaId vs cuentaBancariaId, columnas NOT NULL distintas).
 * Cada insert de Bancos fallaba con PG 23502 "cuentaBancariaId NOT NULL".
 *
 * SOLUCIÓN: tabla propia para el módulo Bancos sin conflicto de esquema.
 * Si había datos en movimientos_bancarios del módulo Bancos, se migran aquí.
 */
export class CreateBancosConciliacion1748100000000 implements MigrationInterface {
  name = 'CreateBancosConciliacion1748100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bancos_conciliacion (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER,
        "cuentaId"       INTEGER NOT NULL,
        fecha            DATE NOT NULL,
        descripcion      VARCHAR(300) NOT NULL,
        referencia       VARCHAR(60),
        tipo             VARCHAR(20) NOT NULL,
        monto            DECIMAL(14,2) NOT NULL,
        "saldoResultante" DECIMAL(14,2),
        conciliado       BOOLEAN NOT NULL DEFAULT false,
        "sistemaId"      INTEGER,
        "sistemaTipo"    VARCHAR(30),
        "isActive"       BOOLEAN NOT NULL DEFAULT true,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Migrar registros del módulo Bancos que pudieron haberse guardado antes
    // (filas con cuentaId pero sin cuentaBancariaId — nunca tuvieron datos válidos
    //  por la restricción NOT NULL, así que la tabla movimientos_bancarios de bancos
    //  debería estar vacía; esta cláusula es solo por seguridad)
    await queryRunner.query(`
      INSERT INTO bancos_conciliacion (
        "empresaId", "cuentaId", fecha, descripcion, referencia,
        tipo, monto, conciliado, "isActive", "createdAt", "updatedAt"
      )
      SELECT
        "empresaId", "cuentaId", fecha, descripcion, referencia,
        COALESCE(tipo::TEXT, 'credito'),
        monto,
        COALESCE(conciliado, false),
        COALESCE("isActive", true),
        "createdAt", "updatedAt"
      FROM movimientos_bancarios
      WHERE "cuentaId" IS NOT NULL
        AND "cuentaBancariaId" IS NULL
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS bancos_conciliacion`);
  }
}
