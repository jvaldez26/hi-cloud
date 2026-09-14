import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';

/**
 * Contrato: list()/findOne() de docentes.service.ts deben consultar
 * ed_asignaciones_docente, la tabla real — ed_seccion_materias nunca
 * existió (42P01, "relation does not exist" en cada carga del módulo).
 * list() además debe calificar "empresaId" con el alias de ed_docentes
 * (d."empresaId") — sin calificar, el JOIN a ed_asignaciones_docente (que
 * también tiene empresaId) lo vuelve ambiguo (42702).
 */
describe('SQL crudo de docentes.service.ts', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');
  const src = () => leer('docentes.service.ts');
  const bloque = (inicio: string, fin: string) => {
    const s = src();
    return s.slice(s.indexOf(inicio), s.indexOf(fin));
  };

  it('list() consulta ed_asignaciones_docente y califica "empresaId" con el alias d', () => {
    const b = bloque('async list(', 'async findOne(');
    expect(b).toContain('ed_asignaciones_docente');
    expect(b).not.toContain('ed_seccion_materias');
    expect(b).toContain('d."empresaId" = $1');
  });

  it('findOne() consulta ed_asignaciones_docente para las secciones del docente', () => {
    const b = bloque('async findOne(', 'async create(');
    expect(b).toContain('FROM ed_asignaciones_docente sm');
    expect(b).not.toContain('ed_seccion_materias');
  });
});

// ── Verificación real contra Postgres — requiere BD ───────────────────────────
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('docentes — SELECT reales contra Postgres', () => {
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

  it('el SELECT de list() no truena (0 filas es una respuesta válida)', async () => {
    await expect(dataSource.query(
      `SELECT d.*,
              COUNT(DISTINCT sm."seccionId")::int AS "totalSecciones"
       FROM ed_docentes d
       LEFT JOIN ed_asignaciones_docente sm ON sm."docenteId" = d.id
       WHERE d."empresaId" = $1
       GROUP BY d.id
       ORDER BY d.apellidos, d.nombres`,
      [-1],
    )).resolves.toEqual([]);
  });

  it('el SELECT de secciones de findOne() no truena (0 filas es una respuesta válida)', async () => {
    await expect(dataSource.query(
      `SELECT sm.*, s.nombre AS "seccionNombre", g.nombre AS "gradoNombre",
              a.nombre AS "asignaturaNombre"
       FROM ed_asignaciones_docente sm
       JOIN ed_secciones s ON s.id = sm."seccionId"
       LEFT JOIN ed_grados g ON g.id = s."gradoId"
       LEFT JOIN ed_asignaturas a ON a.id = sm."asignaturaId"
       WHERE sm."docenteId" = $1 AND sm."empresaId" = $2`,
      [-1, -1],
    )).resolves.toEqual([]);
  });
});
