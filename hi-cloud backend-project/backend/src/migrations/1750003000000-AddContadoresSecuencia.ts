import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla contadores_secuencia y la función atómica siguiente_numero_secuencia.
 * Elimina la race condition en generarNumeroSecuencial() que causaba duplicados (23505)
 * cuando dos cajeros enviaban cobros simultáneos.
 */
export class AddContadoresSecuencia1750003000000 implements MigrationInterface {
  name = 'AddContadoresSecuencia1750003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Tabla de contadores ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contadores_secuencia (
        "empresaId"    INTEGER      NOT NULL,
        tipo           VARCHAR(20)  NOT NULL,
        ultimo_numero  INTEGER      NOT NULL DEFAULT 100,
        PRIMARY KEY ("empresaId", tipo)
      )
    `);

    // ── 2. Función atómica (INSERT ... ON CONFLICT DO UPDATE es atómico en PG) ──
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION siguiente_numero_secuencia(
        p_empresa_id INTEGER,
        p_tipo       VARCHAR
      ) RETURNS INTEGER AS $$
      DECLARE
        v_numero INTEGER;
      BEGIN
        INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
        VALUES (p_empresa_id, p_tipo, 101)
        ON CONFLICT ("empresaId", tipo) DO UPDATE
          SET ultimo_numero = contadores_secuencia.ultimo_numero + 1
        RETURNING ultimo_numero INTO v_numero;
        RETURN v_numero;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // ── 3. Seed: inicializar contadores con el MAX actual de cada tabla ────
    // facturas (folio, FAC-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'FAC',
        GREATEST(100, COALESCE(MAX(CASE WHEN folio ~ '^FAC-[0-9]+$'
          THEN CAST(SUBSTRING(folio FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM facturas
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // notas_credito (numero, NC-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'NC',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^NC-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 4) AS INTEGER) ELSE NULL END), 100))
      FROM notas_credito
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // notas_debito (numero, ND-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'ND',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^ND-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 4) AS INTEGER) ELSE NULL END), 100))
      FROM notas_debito
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // pre_facturas (folio, PRE-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'PRE',
        GREATEST(100, COALESCE(MAX(CASE WHEN folio ~ '^PRE-[0-9]+$'
          THEN CAST(SUBSTRING(folio FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM pre_facturas
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // cotizaciones (numero, COT-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'COT',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^COT-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM cotizaciones
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // conduces (numero, CON-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'CON',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^CON-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM conduces
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // recibos_cobro (numero, REC-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'REC',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^REC-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM recibos_cobro
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // anticipo_cliente (numero, ANT-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'ANT',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^ANT-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM anticipo_cliente
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // devoluciones (numero, DEV-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'DEV',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^DEV-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM devoluciones
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // compras (folio, COM-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'COM',
        GREATEST(100, COALESCE(MAX(CASE WHEN folio ~ '^COM-[0-9]+$'
          THEN CAST(SUBSTRING(folio FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM compras
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // asientos_contables (numero, ASI-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'ASI',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^ASI-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM asientos_contables
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // ordenes_produccion (numero, OP-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'OP',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^OP-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 4) AS INTEGER) ELSE NULL END), 100))
      FROM ordenes_produccion
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // ordenes_mantenimiento (numero, MNT-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'MNT',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^MNT-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM ordenes_mantenimiento
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // ordenes_servicio (numero, SRV-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'SRV',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^SRV-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM ordenes_servicio
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // licitaciones (numero, LIC-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'LIC',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^LIC-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM licitaciones
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // transferencias_almacen (numero, TRF-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'TRF',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^TRF-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM transferencias_almacen
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // depositos_bancarios (numero, DEP-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'DEP',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^DEP-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM depositos_bancarios
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // conteos_inventario (numero, CNT-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'CNT',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^CNT-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM conteos_inventario
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // planes_pago (numero, PP-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'PP',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^PP-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 4) AS INTEGER) ELSE NULL END), 100))
      FROM planes_pago
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // contratos_laborales (numero, CONT-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'CONT',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^CONT-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 6) AS INTEGER) ELSE NULL END), 100))
      FROM contratos_laborales
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);

    // notas_credito_compras (numero, NCC-)
    await queryRunner.query(`
      INSERT INTO contadores_secuencia ("empresaId", tipo, ultimo_numero)
      SELECT "empresaId", 'NCC',
        GREATEST(100, COALESCE(MAX(CASE WHEN numero ~ '^NCC-[0-9]+$'
          THEN CAST(SUBSTRING(numero FROM 5) AS INTEGER) ELSE NULL END), 100))
      FROM notas_credito_compras
      GROUP BY "empresaId"
      ON CONFLICT ("empresaId", tipo) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS siguiente_numero_secuencia(INTEGER, VARCHAR)`);
    await queryRunner.query(`DROP TABLE IF EXISTS contadores_secuencia`);
  }
}
