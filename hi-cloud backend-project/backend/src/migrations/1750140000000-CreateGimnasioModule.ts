import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGimnasioModule1750140000000 implements MigrationInterface {
  name = 'CreateGimnasioModule1750140000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      INSERT INTO modulos_addon (codigo, nombre, descripcion)
      VALUES ('gimnasio', 'Módulo Gimnasio / Fitness Center',
        'Gestión completa para gimnasios: membresías, clases, entrenadores, control de acceso, rutinas, nutrición y facturación automática')
      ON CONFLICT (codigo) DO NOTHING;
    `);

    // 1. gm_miembros
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_miembros (
        id                     SERIAL PRIMARY KEY,
        "empresaId"            INTEGER NOT NULL,
        numero                 VARCHAR(30),
        nombre                 VARCHAR(100) NOT NULL,
        apellidos              VARCHAR(100),
        cedula                 VARCHAR(20),
        "fechaNacimiento"      DATE,
        sexo                   VARCHAR(10),
        telefono               VARCHAR(20),
        "telefonoEmergencia"   VARCHAR(20),
        "contactoEmergencia"   VARCHAR(100),
        email                  VARCHAR(150),
        direccion              TEXT,
        foto                   VARCHAR(500),
        "pesoInicial"          DECIMAL(6,2),
        "tallaInicial"         DECIMAL(6,2),
        "imcInicial"           DECIMAL(6,2),
        objetivo               VARCHAR(200),
        "nivelFitness"         VARCHAR(50),
        "condicionesMedicas"   TEXT,
        lesiones               TEXT,
        medicamentos           TEXT,
        "codigoAcceso"         VARCHAR(100),
        estado                 VARCHAR(30) NOT NULL DEFAULT 'activo',
        "clienteId"            INTEGER,
        "isActive"             BOOLEAN NOT NULL DEFAULT true,
        "createdAt"            TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"            TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 2. gm_planes
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_planes (
        id                        SERIAL PRIMARY KEY,
        "empresaId"               INTEGER NOT NULL,
        nombre                    VARCHAR(100) NOT NULL,
        descripcion               TEXT,
        tipo                      VARCHAR(50),
        "duracionDias"            INTEGER NOT NULL DEFAULT 30,
        precio                    DECIMAL(10,2) NOT NULL DEFAULT 0,
        "precioInscripcion"       DECIMAL(10,2) NOT NULL DEFAULT 0,
        moneda                    VARCHAR(5) NOT NULL DEFAULT 'DOP',
        "incluyeClases"           BOOLEAN NOT NULL DEFAULT true,
        "limiteClasesMes"         INTEGER,
        "incluyeEntrenadorPersonal" BOOLEAN NOT NULL DEFAULT false,
        "sesionesEntrenadorMes"   INTEGER NOT NULL DEFAULT 0,
        "incluyeNutricion"        BOOLEAN NOT NULL DEFAULT false,
        "incluyeLocker"           BOOLEAN NOT NULL DEFAULT false,
        "acceso24h"               BOOLEAN NOT NULL DEFAULT false,
        "permiteCongelar"         BOOLEAN NOT NULL DEFAULT true,
        "diasCongelamientoMax"    INTEGER NOT NULL DEFAULT 15,
        "renovacionAutomatica"    BOOLEAN NOT NULL DEFAULT true,
        "isActive"                BOOLEAN NOT NULL DEFAULT true,
        "createdAt"               TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 3. gm_membresias
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_membresias (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        numero              VARCHAR(30),
        "miembroId"         INTEGER NOT NULL REFERENCES gm_miembros(id),
        "planId"            INTEGER NOT NULL REFERENCES gm_planes(id),
        "fechaInicio"       DATE NOT NULL,
        "fechaFin"          DATE NOT NULL,
        precio              DECIMAL(10,2) NOT NULL DEFAULT 0,
        "precioInscripcion" DECIMAL(10,2) NOT NULL DEFAULT 0,
        descuento           DECIMAL(10,2) NOT NULL DEFAULT 0,
        total               DECIMAL(10,2) NOT NULL DEFAULT 0,
        estado              VARCHAR(30) NOT NULL DEFAULT 'activa',
        congelada           BOOLEAN NOT NULL DEFAULT false,
        "fechaCongelamiento" DATE,
        "diasCongelados"    INTEGER NOT NULL DEFAULT 0,
        "motivoCongelamiento" TEXT,
        "renovacionDe"      INTEGER REFERENCES gm_membresias(id),
        "facturaId"         INTEGER,
        notas               TEXT,
        "createdAt"         TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 4. gm_entrenadores
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_entrenadores (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        nombre           VARCHAR(100) NOT NULL,
        apellidos        VARCHAR(100),
        especialidad     VARCHAR(100),
        certificaciones  TEXT,
        foto             VARCHAR(500),
        telefono         VARCHAR(20),
        email            VARCHAR(150),
        "tarifaSesion"   DECIMAL(10,2) NOT NULL DEFAULT 0,
        "tarifaMes"      DECIMAL(10,2) NOT NULL DEFAULT 0,
        horario          JSONB,
        "empleadoId"     INTEGER,
        "isActive"       BOOLEAN NOT NULL DEFAULT true,
        "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 5. gm_clases
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_clases (
        id                SERIAL PRIMARY KEY,
        "empresaId"       INTEGER NOT NULL,
        nombre            VARCHAR(100) NOT NULL,
        descripcion       TEXT,
        tipo              VARCHAR(50),
        categoria         VARCHAR(50),
        "capacidadMaxima" INTEGER NOT NULL DEFAULT 20,
        "duracionMinutos" INTEGER NOT NULL DEFAULT 60,
        "costoAdicional"  DECIMAL(10,2) NOT NULL DEFAULT 0,
        "entrenadorId"    INTEGER REFERENCES gm_entrenadores(id),
        "imagenUrl"       VARCHAR(500),
        color             VARCHAR(20) NOT NULL DEFAULT '#1E3A8A',
        "isActive"        BOOLEAN NOT NULL DEFAULT true,
        "createdAt"       TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 6. gm_schedule
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_schedule (
        id             SERIAL PRIMARY KEY,
        "empresaId"    INTEGER NOT NULL,
        "claseId"      INTEGER NOT NULL REFERENCES gm_clases(id),
        "entrenadorId" INTEGER REFERENCES gm_entrenadores(id),
        "diaSemana"    INTEGER NOT NULL,
        "horaInicio"   TIME NOT NULL,
        "horaFin"      TIME NOT NULL,
        sala           VARCHAR(50),
        "fechaDesde"   DATE,
        "fechaHasta"   DATE,
        "isActive"     BOOLEAN NOT NULL DEFAULT true,
        "createdAt"    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 7. gm_reservas_clases
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_reservas_clases (
        id            SERIAL PRIMARY KEY,
        "empresaId"   INTEGER NOT NULL,
        "miembroId"   INTEGER NOT NULL REFERENCES gm_miembros(id),
        "scheduleId"  INTEGER NOT NULL REFERENCES gm_schedule(id),
        fecha         DATE NOT NULL,
        estado        VARCHAR(30) NOT NULL DEFAULT 'reservada',
        pagado        BOOLEAN NOT NULL DEFAULT false,
        "facturaId"   INTEGER,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE("miembroId", "scheduleId", fecha)
      )
    `);

    // 8. gm_sesiones_ep
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_sesiones_ep (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "miembroId"      INTEGER NOT NULL REFERENCES gm_miembros(id),
        "entrenadorId"   INTEGER REFERENCES gm_entrenadores(id),
        "membresiaId"    INTEGER REFERENCES gm_membresias(id),
        fecha            TIMESTAMP NOT NULL,
        "duracionMinutos" INTEGER NOT NULL DEFAULT 60,
        tipo             VARCHAR(50),
        estado           VARCHAR(30) NOT NULL DEFAULT 'programada',
        observaciones    TEXT,
        "proximaSesion"  DATE,
        pagado           BOOLEAN NOT NULL DEFAULT false,
        "facturaId"      INTEGER,
        "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 9. gm_rutinas
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_rutinas (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "miembroId"      INTEGER NOT NULL REFERENCES gm_miembros(id),
        "entrenadorId"   INTEGER REFERENCES gm_entrenadores(id),
        nombre           VARCHAR(100) NOT NULL,
        objetivo         VARCHAR(200),
        "duracionSemanas" INTEGER NOT NULL DEFAULT 4,
        nivel            VARCHAR(50),
        "diasSemana"     INTEGER NOT NULL DEFAULT 3,
        "fechaInicio"    DATE,
        "fechaFin"       DATE,
        activa           BOOLEAN NOT NULL DEFAULT true,
        notas            TEXT,
        "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 10. gm_rutina_dias
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_rutina_dias (
        id              SERIAL PRIMARY KEY,
        "empresaId"     INTEGER NOT NULL,
        "rutinaId"      INTEGER NOT NULL REFERENCES gm_rutinas(id) ON DELETE CASCADE,
        "numeroDia"     INTEGER NOT NULL,
        nombre          VARCHAR(100),
        "grupoMuscular" VARCHAR(100),
        "isActive"      BOOLEAN NOT NULL DEFAULT true
      )
    `);

    // 11. gm_rutina_ejercicios
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_rutina_ejercicios (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        "rutinaDiaId"       INTEGER NOT NULL REFERENCES gm_rutina_dias(id) ON DELETE CASCADE,
        nombre              VARCHAR(100) NOT NULL,
        "grupoMuscular"     VARCHAR(100),
        series              INTEGER,
        repeticiones        VARCHAR(50),
        "descansoSegundos"  INTEGER,
        "pesoKg"            DECIMAL(6,2),
        notas               TEXT,
        "videoUrl"          VARCHAR(500),
        "imagenUrl"         VARCHAR(500),
        orden               INTEGER NOT NULL DEFAULT 0
      )
    `);

    // 12. gm_progreso
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_progreso (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "miembroId"      INTEGER NOT NULL REFERENCES gm_miembros(id),
        "entrenadorId"   INTEGER REFERENCES gm_entrenadores(id),
        fecha            DATE NOT NULL,
        peso             DECIMAL(6,2),
        talla            DECIMAL(6,2),
        imc              DECIMAL(6,2),
        "grasaCorporal"  DECIMAL(6,2),
        "masaMuscular"   DECIMAL(6,2),
        pecho            DECIMAL(6,2),
        cintura          DECIMAL(6,2),
        cadera           DECIMAL(6,2),
        "brazoDerecho"   DECIMAL(6,2),
        "brazoIzquierdo" DECIMAL(6,2),
        "musloDerecho"   DECIMAL(6,2),
        "musloIzquierdo" DECIMAL(6,2),
        "fotoFrontal"    VARCHAR(500),
        "fotoPerfil"     VARCHAR(500),
        "fotoEspalda"    VARCHAR(500),
        observaciones    TEXT,
        "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 13. gm_accesos
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_accesos (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        "miembroId"      INTEGER NOT NULL REFERENCES gm_miembros(id),
        "membresiaId"    INTEGER REFERENCES gm_membresias(id),
        tipo             VARCHAR(20) NOT NULL DEFAULT 'entrada',
        "fechaHora"      TIMESTAMP NOT NULL DEFAULT NOW(),
        metodo           VARCHAR(50),
        autorizado       BOOLEAN NOT NULL DEFAULT true,
        "motivoRechazo"  VARCHAR(200),
        "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 14. gm_lockers
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_lockers (
        id               SERIAL PRIMARY KEY,
        "empresaId"      INTEGER NOT NULL,
        numero           VARCHAR(20) NOT NULL,
        area             VARCHAR(50),
        estado           VARCHAR(30) NOT NULL DEFAULT 'disponible',
        "miembroId"      INTEGER REFERENCES gm_miembros(id),
        "fechaAsignacion" DATE,
        "precioMes"      DECIMAL(10,2) NOT NULL DEFAULT 0,
        "isActive"       BOOLEAN NOT NULL DEFAULT true
      )
    `);

    // 15. gm_planes_nutricionales
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_planes_nutricionales (
        id                    SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL,
        "miembroId"           INTEGER NOT NULL REFERENCES gm_miembros(id),
        "entrenadorId"        INTEGER REFERENCES gm_entrenadores(id),
        nombre                VARCHAR(100) NOT NULL,
        objetivo              VARCHAR(200),
        "caloriasObjetivo"    INTEGER,
        "proteinasGramos"     DECIMAL(6,2),
        "carbohidratosGramos" DECIMAL(6,2),
        "grasasGramos"        DECIMAL(6,2),
        "fechaInicio"         DATE,
        "fechaFin"            DATE,
        activo                BOOLEAN NOT NULL DEFAULT true,
        notas                 TEXT,
        "createdAt"           TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // 16. gm_comidas
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_comidas (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        "planNutricionalId" INTEGER NOT NULL REFERENCES gm_planes_nutricionales(id) ON DELETE CASCADE,
        nombre              VARCHAR(100) NOT NULL,
        hora                VARCHAR(10),
        alimentos           JSONB,
        "caloriasTotal"     INTEGER,
        orden               INTEGER NOT NULL DEFAULT 0
      )
    `);

    // 17. gm_productos_tienda
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gm_productos_tienda (
        id           SERIAL PRIMARY KEY,
        "empresaId"  INTEGER NOT NULL,
        nombre       VARCHAR(100) NOT NULL,
        descripcion  TEXT,
        categoria    VARCHAR(50),
        precio       DECIMAL(10,2) NOT NULL DEFAULT 0,
        stock        INTEGER NOT NULL DEFAULT 0,
        "imagenUrl"  VARCHAR(500),
        "productoId" INTEGER,
        "isActive"   BOOLEAN NOT NULL DEFAULT true
      )
    `);

    // Índices
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_gm_miembros_empresa ON gm_miembros ("empresaId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_gm_miembros_estado ON gm_miembros ("empresaId", estado)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_gm_membresias_miembro ON gm_membresias ("miembroId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_gm_membresias_vencimiento ON gm_membresias ("empresaId", "fechaFin")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_gm_accesos_miembro ON gm_accesos ("miembroId", "fechaHora" DESC)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_gm_schedule_dia ON gm_schedule ("empresaId", "diaSemana")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_gm_reservas_fecha ON gm_reservas_clases ("empresaId", fecha)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS gm_comidas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_planes_nutricionales CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_productos_tienda CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_lockers CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_accesos CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_progreso CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_rutina_ejercicios CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_rutina_dias CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_rutinas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_sesiones_ep CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_reservas_clases CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_schedule CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_clases CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_entrenadores CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_membresias CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_planes CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS gm_miembros CASCADE`);
    await qr.query(`DELETE FROM modulos_addon WHERE codigo = 'gimnasio'`);
  }
}
