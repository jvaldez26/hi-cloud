import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea las tablas del módulo de pagos de suscripción:
 *   - pagos_suscripcion   → historial de cargos, pagos y créditos
 *   - configuracion_bancaria → datos bancarios de HiCloud para transferencias
 */
export class CreatePagosSuscripcion1749700000000 implements MigrationInterface {
  name = 'CreatePagosSuscripcion1749700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── pagos_suscripcion ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pagos_suscripcion (
        id               SERIAL       PRIMARY KEY,
        "empresaId"      INTEGER      NOT NULL,
        tipo             VARCHAR(20)  NOT NULL
          CHECK (tipo IN ('TARJETA','TRANSFERENCIA','MANUAL','CREDITO','CARGO')),
        concepto         TEXT         NOT NULL,
        "montoUsd"       NUMERIC(10,2) NOT NULL,
        estado           VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE'
          CHECK (estado IN ('PENDIENTE','CONFIRMADO','RECHAZADO')),
        "comprobanteUrl" TEXT,
        referencia       VARCHAR(255),
        notas            TEXT,
        "registradoPor"  INTEGER,
        "confirmadoPor"  INTEGER,
        "motivoRechazo"  TEXT,
        "periodoInicio"  DATE,
        "periodoFin"     DATE,
        "creadoEn"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "confirmadoEn"   TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pagos_sus_empresa
        ON pagos_suscripcion ("empresaId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pagos_sus_estado
        ON pagos_suscripcion (estado)
    `);

    // ── configuracion_bancaria ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS configuracion_bancaria (
        id              SERIAL       PRIMARY KEY,
        banco           VARCHAR(255) NOT NULL,
        "numeroCuenta"  VARCHAR(50)  NOT NULL,
        "tipoCuenta"    VARCHAR(20)  NOT NULL DEFAULT 'corriente',
        titular         VARCHAR(255) NOT NULL,
        rnc             VARCHAR(20),
        activo          BOOLEAN      NOT NULL DEFAULT true,
        "creadoEn"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "actualizadoEn" TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // Seed inicial con datos de ejemplo (super admin los actualiza desde el panel)
    await queryRunner.query(`
      INSERT INTO configuracion_bancaria
        (banco, "numeroCuenta", "tipoCuenta", titular, rnc, activo)
      VALUES
        ('Banco Popular Dominicano', '000-000000-0', 'corriente',
         'HiCloud ERP SRL', '1-31-12345-6', true)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS pagos_suscripcion`);
    await queryRunner.query(`DROP TABLE IF EXISTS configuracion_bancaria`);
  }
}
