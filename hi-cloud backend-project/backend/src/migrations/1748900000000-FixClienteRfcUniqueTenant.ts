import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SEGURIDAD MULTI-TENANT: corrige constraint única global en clientes.rfc
 *
 * PROBLEMA: Existía UNIQUE(rfc) global → el RNC/Cédula de un cliente de una
 * empresa no podía usarse en otra empresa (ej. "000000000" para Consumidor Final).
 * Además, un tenant podía inferir si cierto RNC existe en otro tenant (data leak).
 *
 * FIX:
 *   1. Eliminar cualquier constraint/índice único global en clientes.rfc
 *   2. Crear índice único COMPUESTO (empresaId, rfc) con filtro parcial
 *      para NULLs y vacíos (permite clientes sin RNC en la misma empresa)
 */
export class FixClienteRfcUniqueTenant1748900000000 implements MigrationInterface {
  name = 'FixClienteRfcUniqueTenant1748900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Eliminar CUALQUIER constraint única de columna simple en clientes.rfc
    //    (sea cual sea su nombre — TypeORM usa distintos nombres según la versión)
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t   ON t.oid = c.conrelid
          JOIN pg_attribute a ON a.attrelid = t.oid
                              AND a.attnum  = ANY(c.conkey)
          WHERE t.relname         = 'clientes'
            AND c.contype         = 'u'           -- unique constraint
            AND a.attname         = 'rfc'
            AND array_length(c.conkey, 1) = 1     -- columna única (no compuesta)
        LOOP
          EXECUTE format('ALTER TABLE clientes DROP CONSTRAINT %I', r.conname);
          RAISE NOTICE 'Dropped constraint: %', r.conname;
        END LOOP;
      END $$;
    `);

    // 2. Eliminar índices únicos simples sobre rfc que no sean ya el compuesto
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN
          SELECT indexname
          FROM pg_indexes
          WHERE tablename = 'clientes'
            AND indexdef  ILIKE '%UNIQUE%'
            AND indexdef  ILIKE '%rfc%'
            AND indexdef  NOT ILIKE '%"empresaId"%'  -- excluir el compuesto que crearemos
            AND indexname != 'UQ_clientes_empresa_rfc'
        LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
          RAISE NOTICE 'Dropped index: %', r.indexname;
        END LOOP;
      END $$;
    `);

    // 3. Crear índice único COMPUESTO por tenant
    //    WHERE filtra NULLs y vacíos → permite múltiples clientes sin RNC/Cédula
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_clientes_empresa_rfc"
      ON clientes("empresaId", rfc)
      WHERE rfc IS NOT NULL AND rfc <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_clientes_empresa_rfc"`);
    // No se restaura la constraint global — era el bug original
  }
}
