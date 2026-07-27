import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEducativoModule1753600000000 implements MigrationInterface {
  name = 'CreateEducativoModule1753600000000';

  async up(qr: QueryRunner): Promise<void> {
    // ── Parte 0: Registrar módulo ─────────────────────────────────────────
    await qr.query(`
      INSERT INTO modulos_addon (codigo, nombre, descripcion)
      VALUES ('educativo', 'Módulo Centro Educativo',
        'Gestión integral para centros educativos: estudiantes, matrículas, académico, calificaciones, asistencia, colegiatura, docentes, comunicación con padres, disciplina, biblioteca, transporte y comedor')
      ON CONFLICT (codigo) DO NOTHING
    `);

    // ── 1. CONFIGURACIÓN DEL CENTRO ───────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_config (
        id                    SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL UNIQUE,
        "nombreCentro"        VARCHAR(300),
        "codigoMinerd"        VARCHAR(100),
        regional              VARCHAR(100),
        "distritoEducativo"   VARCHAR(100),
        "escalaMinima"        DECIMAL(5,2) DEFAULT 0,
        "escalaMaxima"        DECIMAL(5,2) DEFAULT 100,
        "notaMinimaAprobar"   DECIMAL(5,2) DEFAULT 70,
        "usaLetras"           BOOLEAN DEFAULT false,
        "escalaLetras"        JSONB,
        "cantidadPeriodos"    INTEGER DEFAULT 4,
        "tipoPeriodo"         VARCHAR(20) DEFAULT 'trimestre',
        "monedaColegiatura"   VARCHAR(10) DEFAULT 'DOP',
        "createdAt"           TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 2. AÑO ESCOLAR ────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_anios_escolares (
        id             SERIAL PRIMARY KEY,
        "empresaId"    INTEGER NOT NULL,
        nombre         VARCHAR(50) NOT NULL,
        "fechaInicio"  DATE NOT NULL,
        "fechaFin"     DATE NOT NULL,
        estado         VARCHAR(20) DEFAULT 'activo',
        "esActual"     BOOLEAN DEFAULT false,
        "createdAt"    TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 3. NIVELES (Inicial, Primaria, Secundaria) ────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_niveles (
        id           SERIAL PRIMARY KEY,
        "empresaId"  INTEGER NOT NULL,
        nombre       VARCHAR(100) NOT NULL,
        orden        INTEGER DEFAULT 0,
        "isActive"   BOOLEAN DEFAULT true
      )
    `);

    // ── 4. GRADOS ─────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_grados (
        id           SERIAL PRIMARY KEY,
        "empresaId"  INTEGER NOT NULL,
        "nivelId"    INTEGER REFERENCES ed_niveles(id) ON DELETE SET NULL,
        nombre       VARCHAR(100) NOT NULL,
        orden        INTEGER DEFAULT 0,
        "isActive"   BOOLEAN DEFAULT true
      )
    `);

    // ── 5. ASIGNATURAS ────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_asignaturas (
        id              SERIAL PRIMARY KEY,
        "empresaId"     INTEGER NOT NULL,
        nombre          VARCHAR(150) NOT NULL,
        codigo          VARCHAR(50),
        area            VARCHAR(100),
        "esEvaluable"   BOOLEAN DEFAULT true,
        "isActive"      BOOLEAN DEFAULT true
      )
    `);

    // ── 6. SECCIONES / AULAS ──────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_secciones (
        id                SERIAL PRIMARY KEY,
        "empresaId"       INTEGER NOT NULL,
        "gradoId"         INTEGER NOT NULL REFERENCES ed_grados(id) ON DELETE CASCADE,
        "anioEscolarId"   INTEGER REFERENCES ed_anios_escolares(id) ON DELETE SET NULL,
        nombre            VARCHAR(50) NOT NULL,
        "capacidadMaxima" INTEGER DEFAULT 30,
        aula              VARCHAR(50),
        "tutorId"         INTEGER,
        "isActive"        BOOLEAN DEFAULT true,
        "createdAt"       TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 7. PENSUM: ASIGNATURAS POR GRADO ─────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_grado_asignaturas (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "gradoId"        INTEGER NOT NULL REFERENCES ed_grados(id) ON DELETE CASCADE,
        "asignaturaId"   INTEGER NOT NULL REFERENCES ed_asignaturas(id) ON DELETE CASCADE,
        "horasSemanales" INTEGER,
        orden            INTEGER DEFAULT 0,
        UNIQUE("gradoId", "asignaturaId")
      )
    `);

    // ── 8. PERIODOS ACADÉMICOS ────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_periodos (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "anioEscolarId"  INTEGER NOT NULL REFERENCES ed_anios_escolares(id) ON DELETE CASCADE,
        nombre           VARCHAR(50) NOT NULL,
        numero           INTEGER NOT NULL,
        "fechaInicio"    DATE,
        "fechaFin"       DATE,
        ponderacion      DECIMAL(5,2) DEFAULT 25,
        estado           VARCHAR(20) DEFAULT 'abierto',
        "createdAt"      TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 9. BECAS Y DESCUENTOS ─────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_becas (
        id           SERIAL PRIMARY KEY,
        "empresaId"  INTEGER NOT NULL,
        nombre       VARCHAR(150) NOT NULL,
        tipo         VARCHAR(30),
        valor        DECIMAL(12,2),
        "aplicaA"    VARCHAR(50),
        descripcion  TEXT,
        "isActive"   BOOLEAN DEFAULT true
      )
    `);

    // ── 10. ESTUDIANTES ───────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_estudiantes (
        id                      SERIAL PRIMARY KEY,
        "empresaId"             INTEGER NOT NULL,
        matricula               VARCHAR(30),
        nombres                 VARCHAR(200) NOT NULL,
        apellidos               VARCHAR(200) NOT NULL,
        cedula                  VARCHAR(20),
        "actaNacimiento"        VARCHAR(50),
        "fechaNacimiento"       DATE,
        sexo                    VARCHAR(10),
        nacionalidad            VARCHAR(50) DEFAULT 'Dominicana',
        direccion               TEXT,
        telefono                VARCHAR(20),
        email                   VARCHAR(100),
        foto                    TEXT,
        "tipoSangre"            VARCHAR(10),
        alergias                TEXT,
        "condicionesMedicas"    TEXT,
        "medicoTelefono"        VARCHAR(20),
        "seguroMedico"          VARCHAR(100),
        "colegioProcedencia"    VARCHAR(200),
        estado                  VARCHAR(20) DEFAULT 'activo',
        "fechaIngreso"          DATE,
        observaciones           TEXT,
        "clienteId"             INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        "isActive"              BOOLEAN DEFAULT true,
        "createdAt"             TIMESTAMP DEFAULT NOW(),
        "updatedAt"             TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 11. PADRES / TUTORES ──────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_tutores (
        id                    SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL,
        nombres               VARCHAR(200) NOT NULL,
        apellidos             VARCHAR(200),
        cedula                VARCHAR(20),
        parentesco            VARCHAR(50),
        telefono              VARCHAR(20),
        "telefonoTrabajo"     VARCHAR(20),
        email                 VARCHAR(100),
        direccion             TEXT,
        ocupacion             VARCHAR(100),
        "lugarTrabajo"        VARCHAR(200),
        "esResponsablePago"   BOOLEAN DEFAULT false,
        "usuarioPortal"       VARCHAR(100),
        "clienteId"           INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        "isActive"            BOOLEAN DEFAULT true,
        "createdAt"           TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 12. RELACIÓN ESTUDIANTE-TUTOR ─────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_estudiante_tutores (
        id              SERIAL PRIMARY KEY,
        "empresaId"     INTEGER NOT NULL,
        "estudianteId"  INTEGER NOT NULL REFERENCES ed_estudiantes(id) ON DELETE CASCADE,
        "tutorId"       INTEGER NOT NULL REFERENCES ed_tutores(id) ON DELETE CASCADE,
        "esPrincipal"   BOOLEAN DEFAULT false,
        "puedeRetirar"  BOOLEAN DEFAULT true,
        UNIQUE("estudianteId", "tutorId")
      )
    `);

    // ── 13. DOCENTES ──────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_docentes (
        id              SERIAL PRIMARY KEY,
        "empresaId"     INTEGER NOT NULL,
        codigo          VARCHAR(30),
        nombres         VARCHAR(200) NOT NULL,
        apellidos       VARCHAR(200),
        cedula          VARCHAR(20),
        "fechaNacimiento" DATE,
        sexo            VARCHAR(10),
        telefono        VARCHAR(20),
        email           VARCHAR(100),
        direccion       TEXT,
        foto            TEXT,
        titulo          VARCHAR(200),
        especialidad    VARCHAR(200),
        "fechaIngreso"  DATE,
        "empleadoId"    INTEGER,
        "usuarioId"     INTEGER,
        estado          VARCHAR(20) DEFAULT 'activo',
        "isActive"      BOOLEAN DEFAULT true,
        "createdAt"     TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 14. ASIGNACIONES DOCENTE ──────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_asignaciones_docente (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "docenteId"      INTEGER NOT NULL REFERENCES ed_docentes(id) ON DELETE CASCADE,
        "seccionId"      INTEGER NOT NULL REFERENCES ed_secciones(id) ON DELETE CASCADE,
        "asignaturaId"   INTEGER NOT NULL REFERENCES ed_asignaturas(id) ON DELETE CASCADE,
        "anioEscolarId"  INTEGER REFERENCES ed_anios_escolares(id) ON DELETE SET NULL,
        "isActive"       BOOLEAN DEFAULT true
      )
    `);

    // ── 15. MATRÍCULAS ────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_matriculas (
        id                SERIAL PRIMARY KEY,
        "empresaId"       INTEGER NOT NULL,
        numero            VARCHAR(20),
        "estudianteId"    INTEGER NOT NULL REFERENCES ed_estudiantes(id) ON DELETE CASCADE,
        "anioEscolarId"   INTEGER NOT NULL REFERENCES ed_anios_escolares(id) ON DELETE RESTRICT,
        "gradoId"         INTEGER NOT NULL REFERENCES ed_grados(id) ON DELETE RESTRICT,
        "seccionId"       INTEGER REFERENCES ed_secciones(id) ON DELETE SET NULL,
        "fechaMatricula"  DATE DEFAULT CURRENT_DATE,
        tipo              VARCHAR(30) DEFAULT 'nuevo_ingreso',
        "montoInscripcion" DECIMAL(12,2),
        "descuentoBeca"   DECIMAL(12,2) DEFAULT 0,
        "becaId"          INTEGER REFERENCES ed_becas(id) ON DELETE SET NULL,
        estado            VARCHAR(20) DEFAULT 'activa',
        "facturaId"       INTEGER REFERENCES facturas(id) ON DELETE SET NULL,
        notas             TEXT,
        "createdAt"       TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 16. BECAS ASIGNADAS A ESTUDIANTES ────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_estudiante_becas (
        id                SERIAL PRIMARY KEY,
        "empresaId"       INTEGER NOT NULL,
        "estudianteId"    INTEGER NOT NULL REFERENCES ed_estudiantes(id) ON DELETE CASCADE,
        "becaId"          INTEGER NOT NULL REFERENCES ed_becas(id) ON DELETE CASCADE,
        "anioEscolarId"   INTEGER REFERENCES ed_anios_escolares(id) ON DELETE SET NULL,
        "fechaAsignacion" DATE DEFAULT CURRENT_DATE,
        motivo            TEXT,
        "aprobadoPor"     VARCHAR(200),
        "isActive"        BOOLEAN DEFAULT true
      )
    `);

    // ── 17. EVALUACIONES ──────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_evaluaciones (
        id                    SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL,
        "asignacionDocenteId" INTEGER REFERENCES ed_asignaciones_docente(id) ON DELETE SET NULL,
        "seccionId"           INTEGER NOT NULL REFERENCES ed_secciones(id) ON DELETE CASCADE,
        "asignaturaId"        INTEGER NOT NULL REFERENCES ed_asignaturas(id) ON DELETE CASCADE,
        "periodoId"           INTEGER NOT NULL REFERENCES ed_periodos(id) ON DELETE CASCADE,
        nombre                VARCHAR(200) NOT NULL,
        tipo                  VARCHAR(50),
        fecha                 DATE,
        "puntajeMaximo"       DECIMAL(5,2) DEFAULT 100,
        ponderacion           DECIMAL(5,2),
        estado                VARCHAR(20) DEFAULT 'activa',
        "createdAt"           TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 18. CALIFICACIONES ────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_calificaciones (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "evaluacionId"   INTEGER NOT NULL REFERENCES ed_evaluaciones(id) ON DELETE CASCADE,
        "estudianteId"   INTEGER NOT NULL REFERENCES ed_estudiantes(id) ON DELETE CASCADE,
        nota             DECIMAL(5,2),
        observacion      TEXT,
        entregado        BOOLEAN DEFAULT true,
        "registradoPor"  INTEGER REFERENCES ed_docentes(id) ON DELETE SET NULL,
        "createdAt"      TIMESTAMP DEFAULT NOW(),
        "updatedAt"      TIMESTAMP DEFAULT NOW(),
        UNIQUE("evaluacionId", "estudianteId")
      )
    `);

    // ── 19. NOTAS FINALES POR PERIODO (consolidado) ───────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_notas_periodo (
        id              SERIAL PRIMARY KEY,
        "empresaId"     INTEGER NOT NULL,
        "estudianteId"  INTEGER NOT NULL REFERENCES ed_estudiantes(id) ON DELETE CASCADE,
        "asignaturaId"  INTEGER NOT NULL REFERENCES ed_asignaturas(id) ON DELETE CASCADE,
        "seccionId"     INTEGER NOT NULL REFERENCES ed_secciones(id) ON DELETE CASCADE,
        "periodoId"     INTEGER NOT NULL REFERENCES ed_periodos(id) ON DELETE CASCADE,
        "notaFinal"     DECIMAL(5,2),
        "notaLetra"     VARCHAR(5),
        aprobado        BOOLEAN,
        observacion     TEXT,
        UNIQUE("estudianteId", "asignaturaId", "periodoId")
      )
    `);

    // ── 20. ASISTENCIA ────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_asistencia (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "estudianteId"   INTEGER NOT NULL REFERENCES ed_estudiantes(id) ON DELETE CASCADE,
        "seccionId"      INTEGER NOT NULL REFERENCES ed_secciones(id) ON DELETE CASCADE,
        fecha            DATE NOT NULL,
        estado           VARCHAR(20) NOT NULL,
        "asignaturaId"   INTEGER REFERENCES ed_asignaturas(id) ON DELETE SET NULL,
        justificacion    TEXT,
        "registradoPor"  INTEGER REFERENCES ed_docentes(id) ON DELETE SET NULL,
        "createdAt"      TIMESTAMP DEFAULT NOW(),
        UNIQUE("estudianteId", fecha, "asignaturaId")
      )
    `);

    // ── 21. PLANES DE PAGO / COLEGIATURA ─────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_planes_pago (
        id                          SERIAL PRIMARY KEY,
        "empresaId"                 INTEGER NOT NULL,
        nombre                      VARCHAR(150) NOT NULL,
        "gradoId"                   INTEGER REFERENCES ed_grados(id) ON DELETE SET NULL,
        "anioEscolarId"             INTEGER REFERENCES ed_anios_escolares(id) ON DELETE SET NULL,
        "montoInscripcion"          DECIMAL(12,2),
        "montoColegiaturaMensual"   DECIMAL(12,2),
        "cantidadCuotas"            INTEGER DEFAULT 10,
        "montoMaterial"             DECIMAL(12,2) DEFAULT 0,
        "montoSeguro"               DECIMAL(12,2) DEFAULT 0,
        "diaVencimiento"            INTEGER DEFAULT 5,
        "cargoMoraPct"              DECIMAL(6,3) DEFAULT 0,
        "diasGracia"                INTEGER DEFAULT 0,
        "isActive"                  BOOLEAN DEFAULT true,
        "createdAt"                 TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 22. CARGOS DE COLEGIATURA ─────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_cargos (
        id                    SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL,
        numero                VARCHAR(20),
        "estudianteId"        INTEGER NOT NULL REFERENCES ed_estudiantes(id) ON DELETE CASCADE,
        "matriculaId"         INTEGER REFERENCES ed_matriculas(id) ON DELETE SET NULL,
        "tutorResponsableId"  INTEGER REFERENCES ed_tutores(id) ON DELETE SET NULL,
        tipo                  VARCHAR(30) NOT NULL,
        concepto              VARCHAR(200),
        periodo               VARCHAR(20),
        "montoOriginal"       DECIMAL(12,2) NOT NULL,
        descuento             DECIMAL(12,2) DEFAULT 0,
        "montoMora"           DECIMAL(12,2) DEFAULT 0,
        "montoTotal"          DECIMAL(12,2),
        "montoPagado"         DECIMAL(12,2) DEFAULT 0,
        "saldoPendiente"      DECIMAL(12,2),
        "fechaVencimiento"    DATE,
        "fechaPago"           DATE,
        estado                VARCHAR(20) DEFAULT 'pendiente',
        "diasMora"            INTEGER DEFAULT 0,
        "facturaId"           INTEGER REFERENCES facturas(id) ON DELETE SET NULL,
        "createdAt"           TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 23. PAGOS DE COLEGIATURA ──────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_pagos (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        numero              VARCHAR(20),
        "estudianteId"      INTEGER NOT NULL REFERENCES ed_estudiantes(id) ON DELETE CASCADE,
        "tutorId"           INTEGER REFERENCES ed_tutores(id) ON DELETE SET NULL,
        fecha               TIMESTAMP DEFAULT NOW(),
        "montoPagado"       DECIMAL(12,2) NOT NULL,
        "metodoPago"        VARCHAR(50),
        referencia          VARCHAR(100),
        "cargosAfectados"   JSONB,
        "facturaId"         INTEGER REFERENCES facturas(id) ON DELETE SET NULL,
        "reciboId"          INTEGER,
        notas               TEXT,
        "createdAt"         TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 24. DISCIPLINA ────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_disciplina (
        id                    SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL,
        numero                VARCHAR(20),
        "estudianteId"        INTEGER NOT NULL REFERENCES ed_estudiantes(id) ON DELETE CASCADE,
        "seccionId"           INTEGER REFERENCES ed_secciones(id) ON DELETE SET NULL,
        fecha                 DATE NOT NULL,
        tipo                  VARCHAR(30),
        categoria             VARCHAR(100),
        descripcion           TEXT NOT NULL,
        "medidaTomada"        TEXT,
        "reportadoPor"        INTEGER REFERENCES ed_docentes(id) ON DELETE SET NULL,
        "padresNotificados"   BOOLEAN DEFAULT false,
        "fechaNotificacion"   TIMESTAMP,
        estado                VARCHAR(20) DEFAULT 'abierto',
        seguimiento           TEXT,
        "createdAt"           TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 25. BIBLIOTECA - LIBROS ───────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_biblioteca_libros (
        id                    SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL,
        codigo                VARCHAR(50),
        isbn                  VARCHAR(50),
        titulo                VARCHAR(300) NOT NULL,
        autor                 VARCHAR(200),
        editorial             VARCHAR(150),
        categoria             VARCHAR(100),
        "cantidadTotal"       INTEGER DEFAULT 1,
        "cantidadDisponible"  INTEGER DEFAULT 1,
        ubicacion             VARCHAR(100),
        "isActive"            BOOLEAN DEFAULT true
      )
    `);

    // ── 26. PRÉSTAMOS DE BIBLIOTECA ───────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_biblioteca_prestamos (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        "libroId"           INTEGER NOT NULL REFERENCES ed_biblioteca_libros(id) ON DELETE CASCADE,
        "estudianteId"      INTEGER REFERENCES ed_estudiantes(id) ON DELETE SET NULL,
        "docenteId"         INTEGER REFERENCES ed_docentes(id) ON DELETE SET NULL,
        "fechaPrestamo"     DATE DEFAULT CURRENT_DATE,
        "fechaVencimiento"  DATE,
        "fechaDevolucion"   DATE,
        estado              VARCHAR(20) DEFAULT 'prestado',
        "createdAt"         TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 27. TRANSPORTE - RUTAS ────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_transporte_rutas (
        id                SERIAL PRIMARY KEY,
        "empresaId"       INTEGER NOT NULL,
        nombre            VARCHAR(150) NOT NULL,
        descripcion       TEXT,
        chofer            VARCHAR(200),
        "choferTelefono"  VARCHAR(20),
        "vehiculoPlaca"   VARCHAR(20),
        capacidad         INTEGER,
        "costoMensual"    DECIMAL(12,2),
        paradas           JSONB,
        "isActive"        BOOLEAN DEFAULT true
      )
    `);

    // ── 28. ESTUDIANTES EN TRANSPORTE ─────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_transporte_estudiantes (
        id                SERIAL PRIMARY KEY,
        "empresaId"       INTEGER NOT NULL,
        "rutaId"          INTEGER NOT NULL REFERENCES ed_transporte_rutas(id) ON DELETE CASCADE,
        "estudianteId"    INTEGER NOT NULL REFERENCES ed_estudiantes(id) ON DELETE CASCADE,
        "paradaRecogida"  VARCHAR(200),
        "costoMensual"    DECIMAL(12,2),
        "isActive"        BOOLEAN DEFAULT true
      )
    `);

    // ── 29. COMEDOR - PLANES ──────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_comedor_planes (
        id                          SERIAL PRIMARY KEY,
        "empresaId"                 INTEGER NOT NULL,
        "estudianteId"              INTEGER NOT NULL REFERENCES ed_estudiantes(id) ON DELETE CASCADE,
        tipo                        VARCHAR(30),
        "costoMensual"              DECIMAL(12,2),
        "restriccionesAlimenticias" TEXT,
        "isActive"                  BOOLEAN DEFAULT true
      )
    `);

    // ── 30. ENFERMERÍA ────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_enfermeria (
        id                    SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL,
        "estudianteId"        INTEGER NOT NULL REFERENCES ed_estudiantes(id) ON DELETE CASCADE,
        fecha                 TIMESTAMP DEFAULT NOW(),
        motivo                TEXT NOT NULL,
        sintomas              TEXT,
        "atencionBrindada"    TEXT,
        "medicamentoDado"     VARCHAR(200),
        "padresNotificados"   BOOLEAN DEFAULT false,
        "enviadoCasa"         BOOLEAN DEFAULT false,
        "atendidoPor"         VARCHAR(200),
        "createdAt"           TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 31. COMUNICADOS ───────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ed_comunicados (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        titulo              VARCHAR(300) NOT NULL,
        contenido           TEXT NOT NULL,
        tipo                VARCHAR(30),
        "destinatarioTipo"  VARCHAR(30),
        "gradoId"           INTEGER REFERENCES ed_grados(id) ON DELETE SET NULL,
        "seccionId"         INTEGER REFERENCES ed_secciones(id) ON DELETE SET NULL,
        "fechaEnvio"        TIMESTAMP DEFAULT NOW(),
        "enviarWhatsapp"    BOOLEAN DEFAULT false,
        "enviarEmail"       BOOLEAN DEFAULT false,
        "creadoPor"         VARCHAR(200),
        "createdAt"         TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── ÍNDICES ───────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_estudiantes_empresa    ON ed_estudiantes ("empresaId", estado)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_estudiantes_matricula  ON ed_estudiantes ("empresaId", matricula)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_matriculas_anio        ON ed_matriculas ("empresaId", "anioEscolarId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_matriculas_estudiante  ON ed_matriculas ("estudianteId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_calificaciones_eval    ON ed_calificaciones ("evaluacionId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_notas_periodo          ON ed_notas_periodo ("estudianteId", "periodoId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_asistencia_estudiante  ON ed_asistencia ("estudianteId", fecha)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_asistencia_seccion     ON ed_asistencia ("seccionId", fecha)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_cargos_estudiante      ON ed_cargos ("estudianteId", estado)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_cargos_vencimiento     ON ed_cargos ("empresaId", "fechaVencimiento", estado)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_anios_empresa          ON ed_anios_escolares ("empresaId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_grados_nivel          ON ed_grados ("nivelId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_secciones_grado       ON ed_secciones ("gradoId", "anioEscolarId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_docentes_empresa      ON ed_docentes ("empresaId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_pagos_estudiante      ON ed_pagos ("estudianteId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ed_disciplina_estudiante ON ed_disciplina ("estudianteId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS ed_comunicados CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_enfermeria CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_comedor_planes CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_transporte_estudiantes CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_transporte_rutas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_biblioteca_prestamos CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_biblioteca_libros CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_disciplina CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_pagos CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_cargos CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_planes_pago CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_asistencia CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_notas_periodo CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_calificaciones CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_evaluaciones CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_estudiante_becas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_matriculas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_asignaciones_docente CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_docentes CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_estudiante_tutores CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_tutores CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_estudiantes CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_becas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_periodos CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_grado_asignaturas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_secciones CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_asignaturas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_grados CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_niveles CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_anios_escolares CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS ed_config CASCADE`);
    await qr.query(`DELETE FROM modulos_addon WHERE codigo = 'educativo'`);
  }
}
