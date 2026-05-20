import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla anticipo_cliente y agrega totalAnticipos a cierres_caja.
 */
export class AnticiposCliente1748400000000 implements MigrationInterface {
  name = 'AnticiposCliente1748400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Tipo enum para estado del anticipo ────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE anticipo_cliente_estado_enum AS ENUM ('activo', 'aplicado', 'anulado');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // ── 2. Tabla anticipo_cliente ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS anticipo_cliente (
        id               SERIAL PRIMARY KEY,
        "isActive"       BOOLEAN NOT NULL DEFAULT true,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "empresaId"      INTEGER,
        numero           VARCHAR(20)  NOT NULL,
        "clienteId"      INTEGER      NOT NULL,
        "clienteNombre"  VARCHAR(200),
        monto            DECIMAL(14,2) NOT NULL,
        "montoPendiente" DECIMAL(14,2) NOT NULL,
        "tipoPago"       VARCHAR(30)  NOT NULL,
        referencia       VARCHAR(100),
        descripcion      VARCHAR(300) NOT NULL,
        estado           anticipo_cliente_estado_enum NOT NULL DEFAULT 'activo',
        "fechaRegistro"  DATE         NOT NULL,
        "cajaDiariaId"   INTEGER,
        "asientoId"      INTEGER,
        "usuarioId"      INTEGER      NOT NULL,
        "nombreUsuario"  VARCHAR(150)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_anticipo_empresa_cliente"
        ON anticipo_cliente ("empresaId", "clienteId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_anticipo_empresa_estado"
        ON anticipo_cliente ("empresaId", estado)
    `);

    // ── 3. Columna totalAnticipos en cierres_caja ────────────────────────
    await queryRunner.query(`
      ALTER TABLE cierres_caja
        ADD COLUMN IF NOT EXISTS "totalAnticipos" DECIMAL(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE cierres_caja DROP COLUMN IF EXISTS "totalAnticipos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS anticipo_cliente`);
    await queryRunner.query(`DROP TYPE IF EXISTS anticipo_cliente_estado_enum`);
  }
}
