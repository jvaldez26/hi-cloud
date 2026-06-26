import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransporteFase21750310000000 implements MigrationInterface {
  name = 'AddTransporteFase21750310000000';

  async up(qr: QueryRunner): Promise<void> {
    // ── 1. CARGAS DE COMBUSTIBLE ──────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS tr_combustible (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "vehiculoId"     INTEGER REFERENCES tr_vehiculos(id) ON DELETE SET NULL,
        "choferId"       INTEGER REFERENCES tr_choferes(id)  ON DELETE SET NULL,
        fecha            DATE NOT NULL,
        "tipoCombustible" VARCHAR(20) DEFAULT 'gasolina',
        galones          DECIMAL(8,3),
        "precioGalon"    DECIMAL(8,2),
        total            DECIMAL(10,2) NOT NULL,
        odometro         DECIMAL(10,1),
        estacion         VARCHAR(200),
        notas            TEXT,
        "createdAt"      TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 2. MANTENIMIENTOS ─────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS tr_mantenimiento (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "vehiculoId"     INTEGER REFERENCES tr_vehiculos(id) ON DELETE SET NULL,
        fecha            DATE NOT NULL,
        tipo             VARCHAR(20) DEFAULT 'preventivo',
        descripcion      TEXT NOT NULL,
        costo            DECIMAL(12,2) DEFAULT 0,
        proveedor        VARCHAR(200),
        "odometroActual" DECIMAL(10,1),
        "proximaFecha"   DATE,
        "proximoKm"      DECIMAL(10,1),
        estado           VARCHAR(20) DEFAULT 'programado',
        notas            TEXT,
        "createdAt"      TIMESTAMP DEFAULT NOW(),
        "updatedAt"      TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── ÍNDICES ───────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tr_combustible_vehiculo  ON tr_combustible ("vehiculoId", fecha DESC)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tr_combustible_empresa   ON tr_combustible ("empresaId",  fecha DESC)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tr_mantenimiento_vehiculo ON tr_mantenimiento ("vehiculoId", fecha DESC)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tr_mantenimiento_empresa  ON tr_mantenimiento ("empresaId",  estado)`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS tr_mantenimiento CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS tr_combustible   CASCADE`);
  }
}
