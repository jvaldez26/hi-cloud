import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea todas las tablas del módulo Manufactura & Producción:
 *  - listas_materiales   (BOM — Lista de Materiales)
 *  - componentes_lm      (Componentes de cada BOM)
 *  - centros_trabajo     (Máquinas / áreas de producción)
 *  - rutas_produccion    (Rutas con etapas secuenciales)
 *  - etapas_ruta         (Pasos de una ruta)
 *  - ordenes_produccion  (Órdenes de fabricación)
 *  - registro_etapas_orden (WIP — seguimiento por etapa)
 *
 * Usa IF NOT EXISTS para ser idempotente (segura en re-run).
 */
export class CreateManufacturaTables1749900000000 implements MigrationInterface {
  name = 'CreateManufacturaTables1749900000000';

  public async up(qr: QueryRunner): Promise<void> {
    // ── Enums ────────────────────────────────────────────────────────────────
    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE estado_orden_produccion_enum AS ENUM
          ('borrador','planificada','en_proceso','completada','cancelada');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE tipo_centro_trabajo_enum AS ENUM
          ('maquina','manual','subcontratado');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE estado_etapa_orden_enum AS ENUM
          ('pendiente','en_proceso','completada','omitida','rechazada');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // ── listas_materiales (BOM) ───────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS listas_materiales (
        id                  SERIAL PRIMARY KEY,
        "isActive"          BOOLEAN NOT NULL DEFAULT true,
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "empresaId"         INT,
        codigo              VARCHAR(20) NOT NULL UNIQUE,
        nombre              VARCHAR(200) NOT NULL,
        descripcion         TEXT,
        "productoFinalId"   INT NOT NULL,
        rendimiento         DECIMAL(10,4) NOT NULL DEFAULT 1,
        "unidadRendimiento" VARCHAR(20) NOT NULL DEFAULT 'PZA',
        "costoPorUnidad"    DECIMAL(14,2),
        activa              BOOLEAN NOT NULL DEFAULT true
      );
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_lm_empresa ON listas_materiales ("empresaId", "isActive");`);

    // ── componentes_lm ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS componentes_lm (
        id          SERIAL PRIMARY KEY,
        "isActive"  BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "empresaId" INT,
        "listaId"   INT NOT NULL REFERENCES listas_materiales(id) ON DELETE CASCADE,
        "productoId" INT NOT NULL,
        cantidad    DECIMAL(12,4) NOT NULL,
        unidad      VARCHAR(20) NOT NULL DEFAULT 'PZA',
        notas       TEXT,
        orden       INT NOT NULL DEFAULT 0
      );
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_comp_lista ON componentes_lm ("listaId", "isActive");`);

    // ── centros_trabajo ───────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS centros_trabajo (
        id                    SERIAL PRIMARY KEY,
        "isActive"            BOOLEAN NOT NULL DEFAULT true,
        "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        "empresaId"           INT,
        nombre                VARCHAR(100) NOT NULL,
        descripcion           VARCHAR(200),
        tipo                  tipo_centro_trabajo_enum NOT NULL DEFAULT 'manual',
        "capacidadHorasDia"   DECIMAL(8,2) NOT NULL DEFAULT 8,
        "costoHora"           DECIMAL(10,2) NOT NULL DEFAULT 0,
        responsable           VARCHAR(100),
        ubicacion             VARCHAR(200),
        activo                BOOLEAN NOT NULL DEFAULT true
      );
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_centros_empresa ON centros_trabajo ("empresaId", "isActive");`);

    // ── rutas_produccion ──────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS rutas_produccion (
        id          SERIAL PRIMARY KEY,
        "isActive"  BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "empresaId" INT,
        codigo      VARCHAR(20) NOT NULL,
        nombre      VARCHAR(200) NOT NULL,
        descripcion TEXT,
        "listaId"   INT,
        activa      BOOLEAN NOT NULL DEFAULT true
      );
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_rutas_empresa ON rutas_produccion ("empresaId", "isActive");`);

    // ── etapas_ruta ───────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS etapas_ruta (
        id                              SERIAL PRIMARY KEY,
        "isActive"                      BOOLEAN NOT NULL DEFAULT true,
        "createdAt"                     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"                     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "empresaId"                     INT,
        "rutaId"                        INT NOT NULL REFERENCES rutas_produccion(id) ON DELETE CASCADE,
        "centroTrabajoId"               INT REFERENCES centros_trabajo(id),
        orden                           INT NOT NULL DEFAULT 1,
        nombre                          VARCHAR(200) NOT NULL,
        descripcion                     TEXT,
        "tiempoSetupMin"                DECIMAL(8,2) NOT NULL DEFAULT 0,
        "tiempoOperacionMinPorUnidad"   DECIMAL(8,2) NOT NULL DEFAULT 0,
        "esControl"                     BOOLEAN NOT NULL DEFAULT false
      );
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_etapas_ruta ON etapas_ruta ("rutaId");`);

    // ── ordenes_produccion ────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ordenes_produccion (
        id                    SERIAL PRIMARY KEY,
        "isActive"            BOOLEAN NOT NULL DEFAULT true,
        "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        "empresaId"           INT,
        numero                VARCHAR(20) NOT NULL UNIQUE,
        "listaId"             INT NOT NULL REFERENCES listas_materiales(id),
        "cantidadPlanificada" DECIMAL(12,4) NOT NULL,
        "cantidadProducida"   DECIMAL(12,4) NOT NULL DEFAULT 0,
        estado                estado_orden_produccion_enum NOT NULL DEFAULT 'borrador',
        "fechaInicio"         DATE NOT NULL,
        "fechaFinPlanificada" DATE,
        "fechaFinReal"        DATE,
        notas                 TEXT,
        "responsableId"       INT,
        "costoReal"           DECIMAL(14,2)
      );
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ordenes_empresa ON ordenes_produccion ("empresaId", "isActive");`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ordenes_estado  ON ordenes_produccion ("empresaId", estado);`);

    // ── registro_etapas_orden (WIP) ───────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS registro_etapas_orden (
        id                  SERIAL PRIMARY KEY,
        "isActive"          BOOLEAN NOT NULL DEFAULT true,
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "empresaId"         INT,
        "ordenId"           INT NOT NULL REFERENCES ordenes_produccion(id) ON DELETE CASCADE,
        "etapaId"           INT NOT NULL REFERENCES etapas_ruta(id),
        "ordenEtapa"        INT NOT NULL DEFAULT 1,
        estado              estado_etapa_orden_enum NOT NULL DEFAULT 'pendiente',
        "fechaInicio"       TIMESTAMPTZ,
        "fechaFin"          TIMESTAMPTZ,
        "cantidadProcesada" DECIMAL(12,4) NOT NULL DEFAULT 0,
        "operadorId"        INT,
        observaciones       TEXT
      );
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_registro_orden ON registro_etapas_orden ("ordenId", "isActive");`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS registro_etapas_orden CASCADE;`);
    await qr.query(`DROP TABLE IF EXISTS ordenes_produccion CASCADE;`);
    await qr.query(`DROP TABLE IF EXISTS etapas_ruta CASCADE;`);
    await qr.query(`DROP TABLE IF EXISTS rutas_produccion CASCADE;`);
    await qr.query(`DROP TABLE IF EXISTS centros_trabajo CASCADE;`);
    await qr.query(`DROP TABLE IF EXISTS componentes_lm CASCADE;`);
    await qr.query(`DROP TABLE IF EXISTS listas_materiales CASCADE;`);
    await qr.query(`DROP TYPE IF EXISTS estado_etapa_orden_enum;`);
    await qr.query(`DROP TYPE IF EXISTS tipo_centro_trabajo_enum;`);
    await qr.query(`DROP TYPE IF EXISTS estado_orden_produccion_enum;`);
  }
}
