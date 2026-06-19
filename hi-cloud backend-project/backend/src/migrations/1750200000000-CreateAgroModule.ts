import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgroModule1750200000000 implements MigrationInterface {
  name = 'CreateAgroModule1750200000000';

  async up(qr: QueryRunner): Promise<void> {
    // ── Parte 0: Registrar módulo ─────────────────────────────────────────
    await qr.query(`
      INSERT INTO modulos_addon (codigo, nombre, descripcion)
      VALUES ('agro', 'Módulo Agro / Finca',
        'Gestión completa para fincas y agronegocios: parcelas, cultivos, ciclos de siembra y cosecha, ganadería, insumos, costos de producción y trazabilidad')
      ON CONFLICT (codigo) DO NOTHING
    `);

    // ── 1. FINCAS / PROPIEDADES ───────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ag_fincas (
        id                   SERIAL PRIMARY KEY,
        "empresaId"          INTEGER NOT NULL,
        nombre               VARCHAR(200) NOT NULL,
        ubicacion            VARCHAR(300),
        provincia            VARCHAR(100),
        municipio            VARCHAR(100),
        "areaTotal"          DECIMAL(10,2),
        "unidadArea"         VARCHAR(20) DEFAULT 'tarea',
        latitud              DECIMAL(10,6),
        longitud             DECIMAL(10,6),
        "tieneRiego"         BOOLEAN DEFAULT false,
        "tipoRiego"          VARCHAR(50),
        "fuenteAgua"         VARCHAR(100),
        encargado            VARCHAR(200),
        "encargadoTelefono"  VARCHAR(20),
        notas                TEXT,
        "isActive"           BOOLEAN DEFAULT true,
        "createdAt"          TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 2. PARCELAS / LOTES ───────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ag_parcelas (
        id             SERIAL PRIMARY KEY,
        "empresaId"    INTEGER NOT NULL,
        "fincaId"      INTEGER REFERENCES ag_fincas(id) ON DELETE SET NULL,
        nombre         VARCHAR(100) NOT NULL,
        codigo         VARCHAR(50),
        area           DECIMAL(10,2),
        "unidadArea"   VARCHAR(20) DEFAULT 'tarea',
        "tipoSuelo"    VARCHAR(50),
        "phSuelo"      DECIMAL(4,2),
        estado         VARCHAR(30) DEFAULT 'disponible',
        "cultivoActual" VARCHAR(100),
        "isActive"     BOOLEAN DEFAULT true,
        "createdAt"    TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 3. CULTIVOS (CATÁLOGO) ────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ag_cultivos (
        id                      SERIAL PRIMARY KEY,
        "empresaId"             INTEGER NOT NULL,
        nombre                  VARCHAR(100) NOT NULL,
        variedad                VARCHAR(100),
        tipo                    VARCHAR(50),
        "diasCicloPromedio"     INTEGER,
        "rendimientoEsperado"   DECIMAL(10,2),
        "unidadRendimiento"     VARCHAR(30),
        "unidadPorArea"         VARCHAR(50),
        "isActive"              BOOLEAN DEFAULT true,
        "createdAt"             TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 4. CICLOS DE PRODUCCIÓN ───────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ag_ciclos (
        id                       SERIAL PRIMARY KEY,
        "empresaId"              INTEGER NOT NULL,
        numero                   VARCHAR(20),
        "parcelaId"              INTEGER NOT NULL REFERENCES ag_parcelas(id),
        "cultivoId"              INTEGER NOT NULL REFERENCES ag_cultivos(id),
        "fechaSiembra"           DATE NOT NULL,
        "fechaEstimadaCosecha"   DATE,
        "fechaCosechaReal"       DATE,
        "areaSembrada"           DECIMAL(10,2),
        "cantidadSemilla"        DECIMAL(10,2),
        "unidadSemilla"          VARCHAR(30),
        "rendimientoEstimado"    DECIMAL(10,2),
        "cantidadCosechada"      DECIMAL(10,2),
        "unidadCosecha"          VARCHAR(30),
        "mermaPerdida"           DECIMAL(10,2) DEFAULT 0,
        "costoSemilla"           DECIMAL(12,2) DEFAULT 0,
        "costoInsumos"           DECIMAL(12,2) DEFAULT 0,
        "costoManoObra"          DECIMAL(12,2) DEFAULT 0,
        "costoMaquinaria"        DECIMAL(12,2) DEFAULT 0,
        "costoOtros"             DECIMAL(12,2) DEFAULT 0,
        "costoTotal"             DECIMAL(12,2) DEFAULT 0,
        "ingresoVentas"          DECIMAL(12,2) DEFAULT 0,
        estado                   VARCHAR(30) DEFAULT 'sembrado',
        notas                    TEXT,
        "createdAt"              TIMESTAMP DEFAULT NOW(),
        "updatedAt"              TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 5. LABORES / ACTIVIDADES DEL CICLO ───────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ag_labores (
        id                      SERIAL PRIMARY KEY,
        "empresaId"             INTEGER NOT NULL,
        "cicloId"               INTEGER NOT NULL REFERENCES ag_ciclos(id) ON DELETE CASCADE,
        "parcelaId"             INTEGER REFERENCES ag_parcelas(id),
        tipo                    VARCHAR(50) NOT NULL,
        descripcion             TEXT,
        fecha                   DATE NOT NULL,
        "cantidadTrabajadores"  INTEGER,
        "horasTrabajadas"       DECIMAL(6,2),
        "costoManoObra"         DECIMAL(12,2) DEFAULT 0,
        "usoMaquinaria"         VARCHAR(100),
        "costoMaquinaria"       DECIMAL(12,2) DEFAULT 0,
        estado                  VARCHAR(20) DEFAULT 'completada',
        responsable             VARCHAR(200),
        notas                   TEXT,
        "createdAt"             TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 6. APLICACIÓN DE INSUMOS ──────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ag_aplicaciones_insumo (
        id                   SERIAL PRIMARY KEY,
        "empresaId"          INTEGER NOT NULL,
        "cicloId"            INTEGER NOT NULL REFERENCES ag_ciclos(id),
        "laborId"            INTEGER REFERENCES ag_labores(id),
        "productoId"         INTEGER,
        "insumoNombre"       VARCHAR(200) NOT NULL,
        tipo                 VARCHAR(50),
        cantidad             DECIMAL(10,2) NOT NULL,
        unidad               VARCHAR(30),
        "costoUnitario"      DECIMAL(10,2),
        "costoTotal"         DECIMAL(12,2),
        fecha                DATE NOT NULL,
        "dosisPorArea"       VARCHAR(50),
        "metodoAplicacion"   VARCHAR(50),
        "loteInsumo"         VARCHAR(100),
        "periodoCarencia"    INTEGER,
        responsable          VARCHAR(200),
        notas                TEXT,
        "createdAt"          TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 7. COSECHAS ───────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ag_cosechas (
        id                      SERIAL PRIMARY KEY,
        "empresaId"             INTEGER NOT NULL,
        numero                  VARCHAR(20),
        "cicloId"               INTEGER NOT NULL REFERENCES ag_ciclos(id),
        "parcelaId"             INTEGER REFERENCES ag_parcelas(id),
        fecha                   DATE NOT NULL,
        cantidad                DECIMAL(10,2) NOT NULL,
        unidad                  VARCHAR(30),
        calidad                 VARCHAR(50),
        clasificacion           JSONB,
        destino                 VARCHAR(50),
        "cantidadTrabajadores"  INTEGER,
        "costoManoObra"         DECIMAL(12,2) DEFAULT 0,
        "productoId"            INTEGER,
        "ingresadoInventario"   BOOLEAN DEFAULT false,
        notas                   TEXT,
        "createdAt"             TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 8. GANADERÍA — ANIMALES ───────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ag_animales (
        id                   SERIAL PRIMARY KEY,
        "empresaId"          INTEGER NOT NULL,
        "fincaId"            INTEGER REFERENCES ag_fincas(id),
        numero               VARCHAR(50),
        nombre               VARCHAR(100),
        tipo                 VARCHAR(50) NOT NULL,
        raza                 VARCHAR(100),
        sexo                 VARCHAR(10),
        "fechaNacimiento"    DATE,
        "pesoNacimiento"     DECIMAL(8,2),
        "pesoActual"         DECIMAL(8,2),
        color                VARCHAR(50),
        origen               VARCHAR(50),
        "madreId"            INTEGER REFERENCES ag_animales(id),
        "padreId"            INTEGER REFERENCES ag_animales(id),
        proposito            VARCHAR(50),
        estado               VARCHAR(30) DEFAULT 'activo',
        "costoAdquisicion"   DECIMAL(12,2),
        notas                TEXT,
        "fotoUrl"            TEXT,
        "isActive"           BOOLEAN DEFAULT true,
        "createdAt"          TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 9. EVENTOS DE GANADERÍA ───────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ag_eventos_animal (
        id                    SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL,
        "animalId"            INTEGER NOT NULL REFERENCES ag_animales(id),
        tipo                  VARCHAR(50) NOT NULL,
        fecha                 DATE NOT NULL,
        descripcion           TEXT,
        peso                  DECIMAL(8,2),
        producto              VARCHAR(200),
        dosis                 VARCHAR(50),
        costo                 DECIMAL(10,2) DEFAULT 0,
        "cantidadProduccion"  DECIMAL(10,2),
        "unidadProduccion"    VARCHAR(20),
        responsable           VARCHAR(200),
        "proximaFecha"        DATE,
        notas                 TEXT,
        "createdAt"           TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 10. INVENTARIO DE INSUMOS AGRÍCOLAS ───────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ag_insumos (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        nombre              VARCHAR(200) NOT NULL,
        tipo                VARCHAR(50),
        marca               VARCHAR(100),
        presentacion        VARCHAR(100),
        unidad              VARCHAR(30),
        "stockActual"       DECIMAL(10,2) DEFAULT 0,
        "stockMinimo"       DECIMAL(10,2) DEFAULT 0,
        "costoUnitario"     DECIMAL(10,2),
        "requiereReceta"    BOOLEAN DEFAULT false,
        "periodoCarencia"   INTEGER,
        "productoId"        INTEGER,
        "isActive"          BOOLEAN DEFAULT true,
        "createdAt"         TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 11. MAQUINARIA Y EQUIPOS ──────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ag_maquinaria (
        id                      SERIAL PRIMARY KEY,
        "empresaId"             INTEGER NOT NULL,
        nombre                  VARCHAR(200) NOT NULL,
        tipo                    VARCHAR(50),
        marca                   VARCHAR(100),
        modelo                  VARCHAR(100),
        anio                    INTEGER,
        "costoHora"             DECIMAL(10,2),
        "horasUso"              DECIMAL(10,2) DEFAULT 0,
        "ultimoMantenimiento"   DATE,
        "proximoMantenimiento"  DATE,
        estado                  VARCHAR(30) DEFAULT 'operativo',
        notas                   TEXT,
        "isActive"              BOOLEAN DEFAULT true,
        "createdAt"             TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── ÍNDICES ───────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ag_fincas_empresa   ON ag_fincas ("empresaId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ag_parcelas_finca   ON ag_parcelas ("fincaId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ag_parcelas_empresa ON ag_parcelas ("empresaId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ag_ciclos_empresa   ON ag_ciclos ("empresaId", estado)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ag_ciclos_parcela   ON ag_ciclos ("parcelaId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ag_labores_ciclo    ON ag_labores ("cicloId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ag_aplicaciones_ciclo ON ag_aplicaciones_insumo ("cicloId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ag_cosechas_ciclo   ON ag_cosechas ("cicloId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ag_animales_empresa ON ag_animales ("empresaId", estado)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ag_eventos_animal   ON ag_eventos_animal ("animalId", fecha DESC)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ag_insumos_empresa  ON ag_insumos ("empresaId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ag_maquinaria_empresa ON ag_maquinaria ("empresaId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS ag_eventos_animal CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ag_animales CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ag_cosechas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ag_aplicaciones_insumo CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ag_labores CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ag_ciclos CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ag_cultivos CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ag_parcelas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ag_fincas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ag_insumos CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ag_maquinaria CASCADE`);
    await qr.query(`DELETE FROM modulos_addon WHERE codigo = 'agro'`);
  }
}
