import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransporteModule1750300000000 implements MigrationInterface {
  name = 'CreateTransporteModule1750300000000';

  async up(qr: QueryRunner): Promise<void> {
    // ── Parte 0: Registrar módulo ─────────────────────────────────────────
    await qr.query(`
      INSERT INTO modulos_addon (codigo, nombre, descripcion)
      VALUES ('transporte', 'Módulo Transporte',
        'Gestión de flota de vehículos, choferes y viajes con facturación electrónica integrada. Control de estado de la flota, alertas de documentos y dashboard operativo.')
      ON CONFLICT (codigo) DO NOTHING
    `);

    // ── 1. CHOFERES ───────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS tr_choferes (
        id                    SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL,
        nombre                VARCHAR(200) NOT NULL,
        cedula                VARCHAR(20),
        telefono              VARCHAR(20),
        email                 VARCHAR(150),
        licencia              VARCHAR(50),
        "tipoLicencia"        VARCHAR(20),
        "vencimientoLicencia" DATE,
        estado                VARCHAR(20) DEFAULT 'activo',
        notas                 TEXT,
        "isActive"            BOOLEAN DEFAULT true,
        "createdAt"           TIMESTAMP DEFAULT NOW(),
        "updatedAt"           TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 2. VEHÍCULOS ──────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS tr_vehiculos (
        id                    SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL,
        placa                 VARCHAR(20) NOT NULL,
        marca                 VARCHAR(100) NOT NULL,
        modelo                VARCHAR(100) NOT NULL,
        anio                  INTEGER,
        tipo                  VARCHAR(30) DEFAULT 'camion',
        color                 VARCHAR(50),
        capacidad             VARCHAR(50),
        estado                VARCHAR(30) DEFAULT 'operativo',
        "choferId"            INTEGER REFERENCES tr_choferes(id) ON DELETE SET NULL,
        "seguroVencimiento"   DATE,
        "marbeteVencimiento"  DATE,
        "inspeccionVencimiento" DATE,
        notas                 TEXT,
        "isActive"            BOOLEAN DEFAULT true,
        "createdAt"           TIMESTAMP DEFAULT NOW(),
        "updatedAt"           TIMESTAMP DEFAULT NOW(),
        UNIQUE ("empresaId", placa)
      )
    `);

    // ── 3. VIAJES ─────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS tr_viajes (
        id             SERIAL PRIMARY KEY,
        "empresaId"    INTEGER NOT NULL,
        "sucursalId"   INTEGER,
        numero         VARCHAR(30) NOT NULL,
        fecha          DATE NOT NULL,
        origen         VARCHAR(200) NOT NULL,
        destino        VARCHAR(200) NOT NULL,
        "clienteId"    INTEGER,
        "choferId"     INTEGER REFERENCES tr_choferes(id) ON DELETE SET NULL,
        "vehiculoId"   INTEGER REFERENCES tr_vehiculos(id) ON DELETE SET NULL,
        tarifa         DECIMAL(12,2) NOT NULL DEFAULT 0,
        estado         VARCHAR(20) DEFAULT 'programado',
        notas          TEXT,
        "facturaId"    INTEGER,
        "createdAt"    TIMESTAMP DEFAULT NOW(),
        "updatedAt"    TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── ÍNDICES ───────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tr_choferes_empresa  ON tr_choferes ("empresaId", estado)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tr_vehiculos_empresa ON tr_vehiculos ("empresaId", estado)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tr_viajes_empresa    ON tr_viajes ("empresaId", estado, fecha DESC)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tr_viajes_chofer     ON tr_viajes ("choferId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_tr_viajes_vehiculo   ON tr_viajes ("vehiculoId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS tr_viajes   CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS tr_vehiculos CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS tr_choferes  CASCADE`);
    await qr.query(`DELETE FROM modulos_addon WHERE codigo = 'transporte'`);
  }
}
