import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClinicaModule1750030000000 implements MigrationInterface {
  name = 'CreateClinicaModule1750030000000';

  async up(qr: QueryRunner): Promise<void> {
    // ── Registrar módulo ────────────────────────────────────────────────────
    await qr.query(`
      INSERT INTO modulos_addon (codigo, nombre, descripcion, precio_mensual, icono)
      VALUES ('clinica', 'Módulo Clínica / Consultorio',
        'Gestión completa para clínicas y consultorios: pacientes, expedientes médicos, citas, recetas, ARS y facturación médica',
        49.00, '🏥')
      ON CONFLICT (codigo) DO NOTHING
    `);

    // ── 1. PACIENTES ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE cl_pacientes (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        codigo VARCHAR(20),
        cedula VARCHAR(20),
        nombre VARCHAR(200) NOT NULL,
        apellidos VARCHAR(200),
        "fechaNacimiento" DATE,
        sexo VARCHAR(10),
        "estadoCivil" VARCHAR(20),
        telefono VARCHAR(20),
        "telefonoEmergencia" VARCHAR(20),
        "contactoEmergencia" VARCHAR(100),
        email VARCHAR(100),
        direccion TEXT,
        "arsNombre" VARCHAR(100),
        "arsNumeroAfiliado" VARCHAR(50),
        "arsTipo" VARCHAR(30),
        "arsPlan" VARCHAR(100),
        "grupoSanguineo" VARCHAR(10),
        alergias TEXT,
        "antecedentesFamiliares" TEXT,
        "antecedentesPersonales" TEXT,
        "medicamentosActuales" TEXT,
        "clienteId" INTEGER REFERENCES clientes(id),
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 2. MÉDICOS ──────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE cl_medicos (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        nombre VARCHAR(200) NOT NULL,
        apellidos VARCHAR(200),
        especialidad VARCHAR(100),
        subespecialidad VARCHAR(100),
        exequatur VARCHAR(50),
        colegiatura VARCHAR(50),
        telefono VARCHAR(20),
        email VARCHAR(100),
        firma TEXT,
        "selloUrl" TEXT,
        "tarifaConsulta" DECIMAL(10,2),
        "horarioLunes" VARCHAR(50),
        "horarioMartes" VARCHAR(50),
        "horarioMiercoles" VARCHAR(50),
        "horarioJueves" VARCHAR(50),
        "horarioViernes" VARCHAR(50),
        "horarioSabado" VARCHAR(50),
        "horarioDomingo" VARCHAR(50),
        "empleadoId" INTEGER REFERENCES empleados(id),
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 3. CITAS ────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE cl_citas (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        numero VARCHAR(20),
        "pacienteId" INTEGER NOT NULL REFERENCES cl_pacientes(id),
        "medicoId" INTEGER NOT NULL REFERENCES cl_medicos(id),
        fecha DATE NOT NULL,
        hora TIME NOT NULL,
        "duracionMinutos" INTEGER DEFAULT 30,
        "tipoCita" VARCHAR(50),
        motivo TEXT,
        estado VARCHAR(20) DEFAULT 'programada',
        sala VARCHAR(50),
        prioridad VARCHAR(20) DEFAULT 'normal',
        "recordatorioEnviado" BOOLEAN DEFAULT false,
        notas TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 4. CONSULTAS ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE cl_consultas (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        numero VARCHAR(20),
        "pacienteId" INTEGER NOT NULL REFERENCES cl_pacientes(id),
        "medicoId" INTEGER NOT NULL REFERENCES cl_medicos(id),
        "citaId" INTEGER REFERENCES cl_citas(id),
        fecha TIMESTAMP NOT NULL DEFAULT NOW(),
        "tipoCita" VARCHAR(50),
        "motivoConsulta" TEXT NOT NULL,
        "enfermedadActual" TEXT,
        temperatura DECIMAL(4,1),
        "presionSistolica" INTEGER,
        "presionDiastolica" INTEGER,
        "frecuenciaCardiaca" INTEGER,
        "frecuenciaRespiratoria" INTEGER,
        "saturacionOxigeno" DECIMAL(4,1),
        peso DECIMAL(6,2),
        talla DECIMAL(5,2),
        imc DECIMAL(5,2),
        "examenFisico" TEXT,
        "diagnosticoPrincipal" TEXT,
        "diagnosticosCIE10" VARCHAR(500),
        "diagnosticosDescripcion" TEXT,
        "planTratamiento" TEXT,
        indicaciones TEXT,
        "proximaCita" DATE,
        "proximaCitaMotivo" TEXT,
        "recetaGenerada" BOOLEAN DEFAULT false,
        "ordenLaboratorioGenerada" BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 5. SIGNOS VITALES ───────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE cl_signos_vitales (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        "pacienteId" INTEGER NOT NULL REFERENCES cl_pacientes(id),
        "consultaId" INTEGER REFERENCES cl_consultas(id),
        fecha TIMESTAMP DEFAULT NOW(),
        temperatura DECIMAL(4,1),
        "presionSistolica" INTEGER,
        "presionDiastolica" INTEGER,
        "frecuenciaCardiaca" INTEGER,
        "frecuenciaRespiratoria" INTEGER,
        "saturacionOxigeno" DECIMAL(4,1),
        peso DECIMAL(6,2),
        talla DECIMAL(5,2),
        imc DECIMAL(5,2),
        glucosa DECIMAL(6,2),
        "registradoPor" VARCHAR(100)
      )
    `);

    // ── 6. RECETAS ──────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE cl_recetas (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        numero VARCHAR(20),
        "pacienteId" INTEGER NOT NULL REFERENCES cl_pacientes(id),
        "medicoId" INTEGER NOT NULL REFERENCES cl_medicos(id),
        "consultaId" INTEGER REFERENCES cl_consultas(id),
        fecha DATE NOT NULL,
        "fechaVencimiento" DATE,
        diagnostico TEXT,
        "indicacionesGenerales" TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 7. MEDICAMENTOS DE RECETA ───────────────────────────────────────────
    await qr.query(`
      CREATE TABLE cl_receta_medicamentos (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        "recetaId" INTEGER NOT NULL REFERENCES cl_recetas(id) ON DELETE CASCADE,
        medicamento VARCHAR(200) NOT NULL,
        concentracion VARCHAR(100),
        forma VARCHAR(50),
        via VARCHAR(50),
        dosis VARCHAR(100),
        frecuencia VARCHAR(100),
        duracion VARCHAR(100),
        cantidad INTEGER,
        indicaciones TEXT,
        orden INTEGER DEFAULT 1
      )
    `);

    // ── 8. ÓRDENES DE LABORATORIO ───────────────────────────────────────────
    await qr.query(`
      CREATE TABLE cl_ordenes_laboratorio (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        numero VARCHAR(20),
        "pacienteId" INTEGER NOT NULL REFERENCES cl_pacientes(id),
        "medicoId" INTEGER NOT NULL REFERENCES cl_medicos(id),
        "consultaId" INTEGER REFERENCES cl_consultas(id),
        fecha DATE NOT NULL,
        urgente BOOLEAN DEFAULT false,
        "diagnosticoPresuntivo" TEXT,
        indicaciones TEXT,
        estado VARCHAR(20) DEFAULT 'pendiente',
        "fechaResultados" DATE,
        "laboratorioNombre" VARCHAR(100),
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 9. EXÁMENES DE LABORATORIO ──────────────────────────────────────────
    await qr.query(`
      CREATE TABLE cl_examenes_laboratorio (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        "ordenId" INTEGER NOT NULL REFERENCES cl_ordenes_laboratorio(id) ON DELETE CASCADE,
        examen VARCHAR(200) NOT NULL,
        categoria VARCHAR(100),
        resultado TEXT,
        unidad VARCHAR(50),
        "valorReferencia" VARCHAR(100),
        estado VARCHAR(20) DEFAULT 'pendiente'
      )
    `);

    // ── 10. PROCEDIMIENTOS ──────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE cl_procedimientos (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        numero VARCHAR(20),
        "pacienteId" INTEGER NOT NULL REFERENCES cl_pacientes(id),
        "medicoId" INTEGER NOT NULL REFERENCES cl_medicos(id),
        "consultaId" INTEGER REFERENCES cl_consultas(id),
        fecha TIMESTAMP NOT NULL,
        nombre VARCHAR(200) NOT NULL,
        descripcion TEXT,
        "duracionMinutos" INTEGER,
        anestesia VARCHAR(100),
        sala VARCHAR(50),
        estado VARCHAR(30) DEFAULT 'programado',
        complicaciones TEXT,
        notas TEXT,
        costo DECIMAL(10,2),
        "facturaId" INTEGER REFERENCES facturas(id),
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 11. AUTORIZACIONES ARS ──────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE cl_autorizaciones_ars (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        numero VARCHAR(20),
        "pacienteId" INTEGER NOT NULL REFERENCES cl_pacientes(id),
        "medicoId" INTEGER REFERENCES cl_medicos(id),
        "arsNombre" VARCHAR(100) NOT NULL,
        "arsNumeroAfiliado" VARCHAR(50),
        "tipoServicio" VARCHAR(100),
        descripcion TEXT,
        "codigoAutorizacion" VARCHAR(100),
        "montoAutorizado" DECIMAL(10,2),
        "montoCubierto" DECIMAL(10,2),
        "montoPaciente" DECIMAL(10,2),
        estado VARCHAR(30) DEFAULT 'pendiente',
        "fechaSolicitud" DATE,
        "fechaRespuesta" DATE,
        observaciones TEXT,
        "facturaId" INTEGER REFERENCES facturas(id),
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── 12. CATÁLOGO DE SERVICIOS ───────────────────────────────────────────
    await qr.query(`
      CREATE TABLE cl_catalogo_servicios (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        codigo VARCHAR(50),
        nombre VARCHAR(200) NOT NULL,
        descripcion TEXT,
        especialidad VARCHAR(100),
        precio DECIMAL(10,2),
        "precioArs" DECIMAL(10,2),
        "duracionMinutos" INTEGER DEFAULT 30,
        "requiereAutorizacion" BOOLEAN DEFAULT false,
        "isActive" BOOLEAN DEFAULT true
      )
    `);

    // ── 13. SALA DE ESPERA ──────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE cl_sala_espera (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        "citaId" INTEGER NOT NULL REFERENCES cl_citas(id),
        "pacienteId" INTEGER NOT NULL REFERENCES cl_pacientes(id),
        "horaLlegada" TIMESTAMP DEFAULT NOW(),
        "horaLlamada" TIMESTAMP,
        "horaAtencion" TIMESTAMP,
        estado VARCHAR(20) DEFAULT 'esperando',
        turno INTEGER,
        notas TEXT
      )
    `);

    // ── ÍNDICES ─────────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX idx_cl_pacientes_empresa ON cl_pacientes ("empresaId")`);
    await qr.query(`CREATE INDEX idx_cl_pacientes_cedula ON cl_pacientes ("empresaId", cedula)`);
    await qr.query(`CREATE INDEX idx_cl_citas_empresa_fecha ON cl_citas ("empresaId", fecha)`);
    await qr.query(`CREATE INDEX idx_cl_citas_medico ON cl_citas ("medicoId", fecha)`);
    await qr.query(`CREATE INDEX idx_cl_consultas_paciente ON cl_consultas ("pacienteId")`);
    await qr.query(`CREATE INDEX idx_cl_consultas_empresa_fecha ON cl_consultas ("empresaId", fecha DESC)`);
    await qr.query(`CREATE INDEX idx_cl_recetas_paciente ON cl_recetas ("pacienteId")`);
    await qr.query(`CREATE INDEX idx_cl_ordenes_lab_paciente ON cl_ordenes_laboratorio ("pacienteId")`);
    await qr.query(`CREATE INDEX idx_cl_sala_espera_fecha ON cl_sala_espera ("empresaId")`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS cl_sala_espera CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS cl_catalogo_servicios CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS cl_autorizaciones_ars CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS cl_procedimientos CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS cl_examenes_laboratorio CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS cl_ordenes_laboratorio CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS cl_receta_medicamentos CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS cl_recetas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS cl_signos_vitales CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS cl_consultas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS cl_citas CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS cl_medicos CASCADE`);
    await qr.query(`DROP TABLE IF EXISTS cl_pacientes CASCADE`);
    await qr.query(`DELETE FROM modulos_addon WHERE codigo = 'clinica'`);
  }
}
