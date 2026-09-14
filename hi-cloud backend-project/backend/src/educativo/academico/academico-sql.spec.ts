import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';

/**
 * Contrato: academico.service.ts debe usar las columnas reales de
 * ed_evaluaciones (puntajeMaximo, ponderacion, estado — no valorMaximo,
 * porcentaje, isActive) y de ed_asistencia (justificacion — no
 * observaciones), y el ON CONFLICT de bulkAsistencia() debe apuntar al
 * UNIQUE real ("estudianteId", fecha, "asignaturaId"), no a
 * ("estudianteId","seccionId",fecha), que no es ninguna constraint (42P10).
 */
describe('SQL crudo de academico.service.ts', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');
  const src = () => leer('academico.service.ts');
  const bloque = (inicio: string, fin: string) => {
    const s = src();
    return s.slice(s.indexOf(inicio), s.indexOf(fin));
  };

  it('createEvaluacion() usa puntajeMaximo/ponderacion, no valorMaximo/porcentaje', () => {
    const b = bloque('async createEvaluacion(', 'async updateEvaluacion(');
    expect(b).toContain('"puntajeMaximo"');
    expect(b).toContain('ponderacion');
    expect(b).not.toContain('valorMaximo');
    expect(b).not.toContain('dto.porcentaje');
  });

  it('updateEvaluacion() (FIELDS) usa puntajeMaximo/ponderacion/estado, no valorMaximo/porcentaje/isActive', () => {
    const b = bloque('async updateEvaluacion(', '// ── Planilla');
    expect(b).toContain("'puntajeMaximo'");
    expect(b).toContain("'ponderacion'");
    expect(b).toContain("'estado'");
    expect(b).not.toContain("'valorMaximo'");
    expect(b).not.toContain("'porcentaje'");
    expect(b).not.toContain("'isActive'");
  });

  it('getAsistencia() lee a.justificacion, no a.observaciones — la columna no existe en ed_asistencia', () => {
    const b = bloque('async getAsistencia(', 'async bulkAsistencia(');
    expect(b).toContain('a.justificacion');
    expect(b).not.toContain('a.observaciones');
  });

  it('bulkAsistencia() usa justificacion y el ON CONFLICT real ("estudianteId", fecha, "asignaturaId")', () => {
    const b = bloque('async bulkAsistencia(', 'async statsAsistencia(');
    expect(b).toContain('justificacion');
    expect(b).not.toContain('"empresaId","estudianteId","seccionId",fecha,estado,observaciones');
    expect(b).toContain('ON CONFLICT ("estudianteId", fecha, "asignaturaId")');
    expect(b).not.toContain('ON CONFLICT ("estudianteId","seccionId",fecha)');
  });
});

// ── Verificación real contra Postgres — requiere BD ───────────────────────────
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('ed_evaluaciones / ed_asistencia — EXPLAIN y SELECT reales contra Postgres', () => {
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

  it('el INSERT de createEvaluacion() es válido contra el esquema real (EXPLAIN, no ejecuta)', async () => {
    await expect(dataSource.query(
      `EXPLAIN INSERT INTO ed_evaluaciones (
         "empresaId","seccionId","asignaturaId","periodoId",
         nombre, tipo, fecha, "puntajeMaximo", ponderacion
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [-1, -1, -1, null, 'Prueba', 'evaluacion', null, 100, 100],
    )).resolves.toBeDefined();
  });

  it('el SELECT de getAsistencia() no truena (0 filas es una respuesta válida)', async () => {
    await expect(dataSource.query(
      `SELECT a."estudianteId", a.estado, a.justificacion, a.id
       FROM ed_asistencia a
       WHERE a."seccionId" = $1 AND a.fecha = $2 AND a."empresaId" = $3`,
      [-1, '2026-01-01', -1],
    )).resolves.toEqual([]);
  });

  it('el INSERT/ON CONFLICT de bulkAsistencia() es válido contra el esquema real (EXPLAIN, no ejecuta)', async () => {
    await expect(dataSource.query(
      `EXPLAIN INSERT INTO ed_asistencia ("empresaId","estudianteId","seccionId",fecha,estado,justificacion)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("estudianteId", fecha, "asignaturaId") DO UPDATE SET estado = $5, justificacion = $6`,
      [-1, -1, -1, '2026-01-01', 'presente', null],
    )).resolves.toBeDefined();
  });
});
