import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';

/**
 * Contrato: create()/update() de estudiantes.service.ts deben usar las
 * columnas reales de ed_estudiantes (tipoSangre, condicionesMedicas,
 * observaciones) — no los nombres que el código asumía antes
 * (grupoSanguineo, condiciones, notas), que no existen en la tabla.
 * addTutor() debe incluir "empresaId" en el INSERT de
 * ed_estudiante_tutores (columna NOT NULL que antes se omitía).
 */
describe('SQL crudo de estudiantes.service.ts', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');
  const src = () => leer('estudiantes.service.ts');

  const bloque = (inicio: string, fin: string) => {
    const s = src();
    return s.slice(s.indexOf(inicio), s.indexOf(fin));
  };

  it('create() usa tipoSangre/condicionesMedicas/observaciones, no grupoSanguineo/condiciones/notas', () => {
    const b = bloque('async create(', 'async update(');
    expect(b).toContain('"tipoSangre"');
    expect(b).toContain('"condicionesMedicas"');
    expect(b).toContain('observaciones');
    expect(b).not.toContain('grupoSanguineo');
    expect(b).not.toMatch(/\bcondiciones\b(?!Medicas)/);
    expect(b).not.toMatch(/\bnotas\b/);
  });

  it('update() (FIELDS) usa las mismas columnas reales', () => {
    const b = bloque('async update(', 'async addTutor(');
    expect(b).toContain("'tipoSangre'");
    expect(b).toContain("'condicionesMedicas'");
    expect(b).toContain("'observaciones'");
    expect(b).not.toContain('grupoSanguineo');
  });

  it('addTutor() incluye "empresaId" en el INSERT a ed_estudiante_tutores (NOT NULL)', () => {
    const b = bloque('async addTutor(', 'async removeTutor(');
    expect(b).toMatch(/INSERT INTO ed_estudiante_tutores \(\s*"empresaId","estudianteId","tutorId","esPrincipal"\s*\)/);
    expect(b).toContain('[empresaId, estudianteId, tutorId, esPrincipal ?? false]');
  });
});

// ── Verificación real contra Postgres — requiere BD ───────────────────────────
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('ed_estudiantes / ed_estudiante_tutores — EXPLAIN contra Postgres', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type:     'postgres',
      host:     process.env['DB_HOST'],
      port:     Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl:      process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  it('el INSERT de create() es válido contra el esquema real (EXPLAIN, no ejecuta)', async () => {
    await expect(dataSource.query(
      `EXPLAIN INSERT INTO ed_estudiantes (
         "empresaId", nombres, apellidos, sexo, "fechaNacimiento", cedula, foto,
         direccion, telefono, email, "tipoSangre", alergias, "condicionesMedicas", observaciones
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [-1, 'Prueba', 'Prueba', 'M', null, null, null, null, null, null, null, null, null, null],
    )).resolves.toBeDefined();
  });

  it('el INSERT de addTutor() a ed_estudiante_tutores es válido contra el esquema real', async () => {
    await expect(dataSource.query(
      `EXPLAIN INSERT INTO ed_estudiante_tutores ("empresaId","estudianteId","tutorId","esPrincipal")
       VALUES ($1,$2,$3,$4)
       ON CONFLICT ("estudianteId","tutorId") DO UPDATE SET "esPrincipal" = $4`,
      [-1, -1, -1, false],
    )).resolves.toBeDefined();
  });
});
