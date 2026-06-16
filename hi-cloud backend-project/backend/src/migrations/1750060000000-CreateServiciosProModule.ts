import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateServiciosProModule1750060000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Parte 0: Registrar módulo ────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO modulos_addon (codigo, nombre, descripcion)
      VALUES (
        'servicios_pro',
        'Módulo Servicios Profesionales',
        'Gestión completa para firmas de servicios: proyectos, contratos, time tracking, honorarios, expedientes y facturación por horas'
      )
      ON CONFLICT (codigo) DO NOTHING
    `);

    // ── 1. PROFESIONALES ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sp_profesionales (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        nombre           VARCHAR(200) NOT NULL,
        apellidos        VARCHAR(200),
        titulo           VARCHAR(100),
        especialidad     VARCHAR(100),
        colegiatura      VARCHAR(50),
        email            VARCHAR(100),
        telefono         VARCHAR(20),
        "tarifaHora"     DECIMAL(10,2),
        "tarifaDia"      DECIMAL(10,2),
        moneda           VARCHAR(10) DEFAULT 'DOP',
        "horasSemanales" INTEGER DEFAULT 40,
        "empleadoId"     INTEGER REFERENCES empleados(id),
        "usuarioId"      INTEGER REFERENCES users(id),
        "isActive"       BOOLEAN DEFAULT true,
        "createdAt"      TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 2. EXPEDIENTES ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sp_expedientes (
        id                        SERIAL PRIMARY KEY,
        "empresaId"               INTEGER NOT NULL,
        numero                    VARCHAR(20) NOT NULL,
        tipo                      VARCHAR(50),
        nombre                    VARCHAR(300) NOT NULL,
        descripcion               TEXT,
        "clienteId"               INTEGER NOT NULL REFERENCES clientes(id),
        "clienteContacto"         VARCHAR(200),
        "profesionalId"           INTEGER REFERENCES sp_profesionales(id),
        "fechaInicio"             DATE NOT NULL,
        "fechaEstimadaFin"        DATE,
        "fechaFinReal"            DATE,
        "tipoFacturacion"         VARCHAR(30),
        "presupuestoTotal"        DECIMAL(12,2),
        "tarifaHoraProyecto"      DECIMAL(10,2),
        moneda                    VARCHAR(10) DEFAULT 'DOP',
        "retainerMensual"         DECIMAL(12,2),
        "horasIncluidasRetainer"  INTEGER,
        estado                    VARCHAR(30) DEFAULT 'activo',
        prioridad                 VARCHAR(20) DEFAULT 'normal',
        "totalHorasRegistradas"   DECIMAL(10,2) DEFAULT 0,
        "totalFacturado"          DECIMAL(12,2) DEFAULT 0,
        "totalCobrado"            DECIMAL(12,2) DEFAULT 0,
        "requiereAprobacionHoras" BOOLEAN DEFAULT false,
        notas                     TEXT,
        "isActive"                BOOLEAN DEFAULT true,
        "createdAt"               TIMESTAMP DEFAULT NOW(),
        "updatedAt"               TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 3. TAREAS ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sp_tareas (
        id                 SERIAL PRIMARY KEY,
        "empresaId"        INTEGER NOT NULL,
        "expedienteId"     INTEGER NOT NULL REFERENCES sp_expedientes(id),
        titulo             VARCHAR(300) NOT NULL,
        descripcion        TEXT,
        categoria          VARCHAR(100),
        "profesionalId"    INTEGER REFERENCES sp_profesionales(id),
        "fechaInicio"      DATE,
        "fechaVencimiento" DATE,
        "fechaCompletado"  TIMESTAMP,
        "horasEstimadas"   DECIMAL(6,2),
        "horasReales"      DECIMAL(6,2) DEFAULT 0,
        estado             VARCHAR(20) DEFAULT 'pendiente',
        prioridad          VARCHAR(20) DEFAULT 'normal',
        facturable         BOOLEAN DEFAULT true,
        orden              INTEGER DEFAULT 0,
        "createdAt"        TIMESTAMP DEFAULT NOW(),
        "updatedAt"        TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 4. TIEMPO (TIME TRACKING) ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sp_tiempo (
        id              SERIAL PRIMARY KEY,
        "empresaId"     INTEGER NOT NULL,
        "expedienteId"  INTEGER NOT NULL REFERENCES sp_expedientes(id),
        "tareaId"       INTEGER REFERENCES sp_tareas(id),
        "profesionalId" INTEGER NOT NULL REFERENCES sp_profesionales(id),
        fecha           DATE NOT NULL,
        "horaInicio"    TIME,
        "horaFin"       TIME,
        horas           DECIMAL(6,2) NOT NULL,
        descripcion     TEXT NOT NULL,
        categoria       VARCHAR(100),
        facturable      BOOLEAN DEFAULT true,
        "tarifaHora"    DECIMAL(10,2),
        monto           DECIMAL(12,2),
        facturado       BOOLEAN DEFAULT false,
        "facturaId"     INTEGER REFERENCES facturas(id),
        aprobado        BOOLEAN DEFAULT false,
        "aprobadoPor"   VARCHAR(100),
        notas           TEXT,
        "createdAt"     TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 5. GASTOS DEL EXPEDIENTE ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sp_gastos_expediente (
        id              SERIAL PRIMARY KEY,
        "empresaId"     INTEGER NOT NULL,
        "expedienteId"  INTEGER NOT NULL REFERENCES sp_expedientes(id),
        "profesionalId" INTEGER REFERENCES sp_profesionales(id),
        fecha           DATE NOT NULL,
        descripcion     TEXT NOT NULL,
        categoria       VARCHAR(100),
        monto           DECIMAL(12,2) NOT NULL,
        comprobante     VARCHAR(200),
        reembolsable    BOOLEAN DEFAULT true,
        reembolsado     BOOLEAN DEFAULT false,
        "facturaId"     INTEGER REFERENCES facturas(id),
        notas           TEXT,
        "createdAt"     TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 6. CONTRATOS ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sp_contratos (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        numero              VARCHAR(20) NOT NULL,
        "expedienteId"      INTEGER REFERENCES sp_expedientes(id),
        "clienteId"         INTEGER NOT NULL REFERENCES clientes(id),
        "profesionalId"     INTEGER REFERENCES sp_profesionales(id),
        titulo              VARCHAR(300) NOT NULL,
        tipo                VARCHAR(50),
        contenido           TEXT,
        "fechaInicio"       DATE NOT NULL,
        "fechaVencimiento"  DATE,
        valor               DECIMAL(12,2),
        moneda              VARCHAR(10) DEFAULT 'DOP',
        estado              VARCHAR(20) DEFAULT 'borrador',
        "fechaFirmaCliente" TIMESTAMP,
        "firmadoPor"        VARCHAR(200),
        "firmaClienteUrl"   TEXT,
        "firmaEmpresaUrl"   TEXT,
        "facturaId"         INTEGER REFERENCES facturas(id),
        notas               TEXT,
        "createdAt"         TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 7. DOCUMENTOS ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sp_documentos (
        id             SERIAL PRIMARY KEY,
        "empresaId"    INTEGER NOT NULL,
        "expedienteId" INTEGER NOT NULL REFERENCES sp_expedientes(id),
        nombre         VARCHAR(300) NOT NULL,
        descripcion    TEXT,
        tipo           VARCHAR(50),
        url            TEXT,
        "tamanioBytes" INTEGER,
        "subidoPor"    INTEGER REFERENCES users(id),
        "subidoAt"     TIMESTAMP DEFAULT NOW(),
        "isActive"     BOOLEAN DEFAULT true
      )
    `);

    // ── 8. REUNIONES ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sp_reuniones (
        id                      SERIAL PRIMARY KEY,
        "empresaId"             INTEGER NOT NULL,
        "expedienteId"          INTEGER REFERENCES sp_expedientes(id),
        titulo                  VARCHAR(300) NOT NULL,
        tipo                    VARCHAR(50),
        fecha                   TIMESTAMP NOT NULL,
        "duracionMinutos"       INTEGER DEFAULT 60,
        lugar                   VARCHAR(200),
        "enlaceVirtual"         VARCHAR(500),
        "profesionalId"         INTEGER REFERENCES sp_profesionales(id),
        "participantesExternos" TEXT,
        estado                  VARCHAR(20) DEFAULT 'programada',
        acuerdos                TEXT,
        "proximosPasos"         TEXT,
        "recordatorioEnviado"   BOOLEAN DEFAULT false,
        "horasRegistradas"      DECIMAL(6,2),
        "createdAt"             TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 9. FACTURAS DE HONORARIOS ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sp_facturas_honorarios (
        id                    SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL,
        numero                VARCHAR(20) NOT NULL,
        "expedienteId"        INTEGER NOT NULL REFERENCES sp_expedientes(id),
        "clienteId"           INTEGER NOT NULL REFERENCES clientes(id),
        "periodoDesde"        DATE,
        "periodoHasta"        DATE,
        "horasFacturadas"     DECIMAL(10,2) DEFAULT 0,
        "montoHoras"          DECIMAL(12,2) DEFAULT 0,
        "gastosReembolsables" DECIMAL(12,2) DEFAULT 0,
        descuento             DECIMAL(12,2) DEFAULT 0,
        itbis                 DECIMAL(12,2) DEFAULT 0,
        total                 DECIMAL(12,2) DEFAULT 0,
        estado                VARCHAR(20) DEFAULT 'borrador',
        "fechaPago"           DATE,
        "fechaEnvio"          DATE,
        "fechaVencimiento"    DATE,
        "facturaId"           INTEGER REFERENCES facturas(id),
        notas                 TEXT,
        "createdAt"           TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 10. RETAINERS ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sp_retainers (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "expedienteId"   INTEGER NOT NULL REFERENCES sp_expedientes(id),
        "clienteId"      INTEGER NOT NULL REFERENCES clientes(id),
        "montoMensual"   DECIMAL(12,2) NOT NULL,
        "horasIncluidas" INTEGER,
        periodicidad     VARCHAR(20) DEFAULT 'mensual',
        "diaFacturacion" INTEGER DEFAULT 1,
        "fechaInicio"    DATE,
        "fechaFin"       DATE,
        estado           VARCHAR(20) DEFAULT 'activo',
        notas            TEXT,
        "isActive"       BOOLEAN DEFAULT true,
        "createdAt"      TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 11. RETAINER PAGOS ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sp_retainer_pagos (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "retainerId"     INTEGER NOT NULL REFERENCES sp_retainers(id),
        periodo          VARCHAR(20) NOT NULL,
        monto            DECIMAL(12,2),
        "horasUsadas"    DECIMAL(10,2) DEFAULT 0,
        "horasRestantes" DECIMAL(10,2),
        estado           VARCHAR(20) DEFAULT 'pendiente',
        "fechaPago"      DATE,
        "metodoPago"     VARCHAR(50),
        referencia       VARCHAR(200),
        "facturaId"      INTEGER REFERENCES facturas(id),
        "createdAt"      TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Índices ───────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sp_expedientes_empresa   ON sp_expedientes ("empresaId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sp_expedientes_estado    ON sp_expedientes ("empresaId", estado)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sp_expedientes_cliente   ON sp_expedientes ("clienteId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sp_tiempo_expediente     ON sp_tiempo ("expedienteId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sp_tiempo_profesional    ON sp_tiempo ("profesionalId", fecha DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sp_tiempo_facturado      ON sp_tiempo ("empresaId", facturado)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sp_tareas_expediente     ON sp_tareas ("expedienteId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sp_retainer_pagos`);
    await queryRunner.query(`DROP TABLE IF EXISTS sp_retainers`);
    await queryRunner.query(`DROP TABLE IF EXISTS sp_facturas_honorarios`);
    await queryRunner.query(`DROP TABLE IF EXISTS sp_reuniones`);
    await queryRunner.query(`DROP TABLE IF EXISTS sp_documentos`);
    await queryRunner.query(`DROP TABLE IF EXISTS sp_contratos`);
    await queryRunner.query(`DROP TABLE IF EXISTS sp_gastos_expediente`);
    await queryRunner.query(`DROP TABLE IF EXISTS sp_tiempo`);
    await queryRunner.query(`DROP TABLE IF EXISTS sp_tareas`);
    await queryRunner.query(`DROP TABLE IF EXISTS sp_expedientes`);
    await queryRunner.query(`DROP TABLE IF EXISTS sp_profesionales`);
    await queryRunner.query(`DELETE FROM modulos_addon WHERE codigo = 'servicios_pro'`);
  }
}
