import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOpticaModule1750011000000 implements MigrationInterface {
  name = 'CreateOpticaModule1750011000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. op_pacientes ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS op_pacientes (
        id                SERIAL PRIMARY KEY,
        "empresaId"       INTEGER NOT NULL,
        nombre            VARCHAR(100) NOT NULL,
        apellido          VARCHAR(100) NOT NULL,
        cedula            VARCHAR(20),
        "fechaNacimiento" DATE,
        genero            VARCHAR(10),
        telefono          VARCHAR(20),
        email             VARCHAR(150),
        direccion         TEXT,
        ocupacion         VARCHAR(100),
        notas             TEXT,
        "isActive"        BOOLEAN NOT NULL DEFAULT true,
        "createdAt"       TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"       TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_pacientes_empresa ON op_pacientes ("empresaId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_pacientes_cedula ON op_pacientes ("empresaId", cedula)
    `);

    // ── 2. op_medicos ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS op_medicos (
        id            SERIAL PRIMARY KEY,
        "empresaId"   INTEGER NOT NULL,
        nombre        VARCHAR(100) NOT NULL,
        apellido      VARCHAR(100) NOT NULL,
        especialidad  VARCHAR(100) NOT NULL DEFAULT 'Optometría',
        exequatur     VARCHAR(50),
        telefono      VARCHAR(20),
        email         VARCHAR(150),
        "isActive"    BOOLEAN NOT NULL DEFAULT true,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"   TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_medicos_empresa ON op_medicos ("empresaId")
    `);

    // ── 3. op_citas ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS op_citas (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        numero              VARCHAR(30) NOT NULL,
        "pacienteId"        INTEGER NOT NULL,
        "medicoId"          INTEGER,
        "fechaHora"         TIMESTAMP NOT NULL,
        "duracionMinutos"   INTEGER NOT NULL DEFAULT 30,
        tipo                VARCHAR(50) NOT NULL DEFAULT 'consulta',
        estado              VARCHAR(30) NOT NULL DEFAULT 'programada',
        "motivoConsulta"    TEXT,
        notas               TEXT,
        "createdBy"         INTEGER,
        "createdAt"         TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"         TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_op_citas_numero'
        ) THEN
          ALTER TABLE op_citas ADD CONSTRAINT uq_op_citas_numero UNIQUE ("empresaId", numero);
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_citas_empresa ON op_citas ("empresaId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_citas_fecha ON op_citas ("empresaId", "fechaHora")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_citas_paciente ON op_citas ("empresaId", "pacienteId")
    `);

    // ── 4. op_consultas ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS op_consultas (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        numero              VARCHAR(30) NOT NULL,
        "pacienteId"        INTEGER NOT NULL,
        "medicoId"          INTEGER,
        "citaId"            INTEGER,
        fecha               DATE NOT NULL,
        "motivoConsulta"    TEXT,
        "agudezaVisualOD"   VARCHAR(20),
        "agudezaVisualOI"   VARCHAR(20),
        "presionOcularOD"   DECIMAL(5,2),
        "presionOcularOI"   DECIMAL(5,2),
        hallazgos           TEXT,
        diagnostico         TEXT,
        tratamiento         TEXT,
        "proximaCita"       DATE,
        notas               TEXT,
        "createdAt"         TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"         TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_op_consultas_numero'
        ) THEN
          ALTER TABLE op_consultas ADD CONSTRAINT uq_op_consultas_numero UNIQUE ("empresaId", numero);
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_consultas_empresa ON op_consultas ("empresaId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_consultas_paciente ON op_consultas ("empresaId", "pacienteId")
    `);

    // ── 5. op_recetas ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS op_recetas (
        id              SERIAL PRIMARY KEY,
        "empresaId"     INTEGER NOT NULL,
        numero          VARCHAR(30) NOT NULL,
        "pacienteId"    INTEGER NOT NULL,
        "medicoId"      INTEGER,
        "consultaId"    INTEGER,
        fecha           DATE NOT NULL,
        tipo            VARCHAR(30) NOT NULL DEFAULT 'lentes',
        "esferaOD"      DECIMAL(5,2),
        "cilindroOD"    DECIMAL(5,2),
        "ejeOD"         DECIMAL(5,1),
        "adicionOD"     DECIMAL(5,2),
        "esferaOI"      DECIMAL(5,2),
        "cilindroOI"    DECIMAL(5,2),
        "ejeOI"         DECIMAL(5,1),
        "adicionOI"     DECIMAL(5,2),
        "dipLejos"      DECIMAL(5,1),
        "dipCerca"      DECIMAL(5,1),
        "marcaContacto" VARCHAR(100),
        "tipoContacto"  VARCHAR(100),
        instrucciones   TEXT,
        "vigenciaAnos"  INTEGER NOT NULL DEFAULT 1,
        notas           TEXT,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_op_recetas_numero'
        ) THEN
          ALTER TABLE op_recetas ADD CONSTRAINT uq_op_recetas_numero UNIQUE ("empresaId", numero);
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_recetas_empresa ON op_recetas ("empresaId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_recetas_paciente ON op_recetas ("empresaId", "pacienteId")
    `);

    // ── 6. op_ordenes_trabajo ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS op_ordenes_trabajo (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL,
        numero              VARCHAR(30) NOT NULL,
        "pacienteId"        INTEGER NOT NULL,
        "recetaId"          INTEGER,
        fecha               DATE NOT NULL,
        estado              VARCHAR(30) NOT NULL DEFAULT 'pendiente',
        "tipoLente"         VARCHAR(100),
        "materialLente"     VARCHAR(100),
        "tratamientoLente"  VARCHAR(200),
        "colorMontura"      VARCHAR(50),
        "marcaMontura"      VARCHAR(100),
        "modeloMontura"     VARCHAR(100),
        subtotal            DECIMAL(12,2) NOT NULL DEFAULT 0,
        itbis               DECIMAL(12,2) NOT NULL DEFAULT 0,
        total               DECIMAL(12,2) NOT NULL DEFAULT 0,
        abono               DECIMAL(12,2) NOT NULL DEFAULT 0,
        balance             DECIMAL(12,2) NOT NULL DEFAULT 0,
        "facturaId"         INTEGER,
        notas               TEXT,
        "fechaEntrega"      DATE,
        "createdBy"         INTEGER,
        "createdAt"         TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"         TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_op_ordenes_trabajo_numero'
        ) THEN
          ALTER TABLE op_ordenes_trabajo ADD CONSTRAINT uq_op_ordenes_trabajo_numero UNIQUE ("empresaId", numero);
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_ordenes_trabajo_empresa ON op_ordenes_trabajo ("empresaId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_ordenes_trabajo_estado ON op_ordenes_trabajo ("empresaId", estado)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_ordenes_trabajo_paciente ON op_ordenes_trabajo ("empresaId", "pacienteId")
    `);

    // ── 7. op_reclamaciones_ars ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS op_reclamaciones_ars (
        id                    SERIAL PRIMARY KEY,
        "empresaId"           INTEGER NOT NULL,
        numero                VARCHAR(30) NOT NULL,
        "pacienteId"          INTEGER NOT NULL,
        "arsNombre"           VARCHAR(100) NOT NULL,
        "arsNumeroAfiliado"   VARCHAR(50),
        "consultaId"          INTEGER,
        "recetaId"            INTEGER,
        "ordenTrabajoId"      INTEGER,
        fecha                 DATE NOT NULL,
        estado                VARCHAR(30) NOT NULL DEFAULT 'borrador',
        "montoReclamado"      DECIMAL(12,2) NOT NULL DEFAULT 0,
        "montoCubierto"       DECIMAL(12,2) NOT NULL DEFAULT 0,
        "montoPaciente"       DECIMAL(12,2) NOT NULL DEFAULT 0,
        "motivoRechazo"       TEXT,
        observaciones         TEXT,
        "createdAt"           TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"           TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_op_reclamaciones_ars_numero'
        ) THEN
          ALTER TABLE op_reclamaciones_ars ADD CONSTRAINT uq_op_reclamaciones_ars_numero UNIQUE ("empresaId", numero);
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_reclamaciones_ars_empresa ON op_reclamaciones_ars ("empresaId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_reclamaciones_ars_estado ON op_reclamaciones_ars ("empresaId", estado)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS op_reclamaciones_ars`);
    await queryRunner.query(`DROP TABLE IF EXISTS op_ordenes_trabajo`);
    await queryRunner.query(`DROP TABLE IF EXISTS op_recetas`);
    await queryRunner.query(`DROP TABLE IF EXISTS op_consultas`);
    await queryRunner.query(`DROP TABLE IF EXISTS op_citas`);
    await queryRunner.query(`DROP TABLE IF EXISTS op_medicos`);
    await queryRunner.query(`DROP TABLE IF EXISTS op_pacientes`);
  }
}
