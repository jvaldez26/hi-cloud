import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVehiculoFinanciamiento1752600000000 implements MigrationInterface {
  name = 'AddVehiculoFinanciamiento1752600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── Tabla de vehículos financiados ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pr_vehiculos (
        id              serial        PRIMARY KEY,
        "empresaId"     integer       NOT NULL,
        "sucursalId"    integer,

        -- Identificación
        placa           varchar(20),
        chasis          varchar(50),
        motor           varchar(50),
        marca           varchar(50),
        modelo          varchar(50),
        anio            integer,
        color           varchar(30),
        "tipoVehiculo"  varchar(30),

        -- Valores
        "valorMercado"  numeric(15,2),
        "valorFactura"  numeric(15,2),

        -- Seguro obligatorio
        aseguradora         varchar(100),
        "polizaSeguro"      varchar(50),
        "fechaVencePoliza"  date,

        activo        boolean   NOT NULL DEFAULT true,
        "createdAt"   timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pr_vehiculos_empresa
        ON pr_vehiculos("empresaId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pr_vehiculos_placa
        ON pr_vehiculos(placa)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pr_vehiculos_chasis
        ON pr_vehiculos(chasis)
    `);

    // ── FK vehiculoId en préstamos y solicitudes (nullable) ──────────────────
    await queryRunner.query(`
      ALTER TABLE pr_prestamos
        ADD COLUMN IF NOT EXISTS "vehiculoId" integer
    `);
    await queryRunner.query(`
      ALTER TABLE pr_solicitudes
        ADD COLUMN IF NOT EXISTS "vehiculoId" integer
    `);

    // ── tipoCredito en productos de préstamo ─────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE pr_productos_prestamo
        ADD COLUMN IF NOT EXISTS "tipoCredito" varchar(20) NOT NULL DEFAULT 'personal'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pr_productos_prestamo DROP COLUMN IF EXISTS "tipoCredito"`);
    await queryRunner.query(`ALTER TABLE pr_solicitudes DROP COLUMN IF EXISTS "vehiculoId"`);
    await queryRunner.query(`ALTER TABLE pr_prestamos DROP COLUMN IF EXISTS "vehiculoId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_pr_vehiculos_chasis`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_pr_vehiculos_placa`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_pr_vehiculos_empresa`);
    await queryRunner.query(`DROP TABLE IF EXISTS pr_vehiculos`);
  }
}
