import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';

/**
 * Contrato: list() de tutores.service.ts debe calificar "empresaId" con el
 * alias de ed_tutores (t."empresaId") — sin calificar, el JOIN a
 * ed_estudiante_tutores (que también tiene empresaId) lo vuelve ambiguo
 * (42702, "column reference empresaId is ambiguous").
 */
describe('SQL crudo de tutores.service.ts', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');
  const src = () => leer('tutores.service.ts');

  it('list() califica "empresaId" con el alias t, no un nombre suelto ambiguo con el JOIN', () => {
    const s = src();
    const b = s.slice(s.indexOf('async list('), s.indexOf('async findOne('));
    expect(b).toContain('t."empresaId" = $1');
    expect(b).not.toMatch(/const conds: string\[\] = \[`"empresaId" = \$1`\]/);
  });
});

// ── Verificación real contra Postgres — requiere BD ───────────────────────────
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('tutores — SELECT real contra Postgres', () => {
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
      `SELECT t.*,
              COUNT(et."estudianteId")::int AS "totalEstudiantes"
       FROM ed_tutores t
       LEFT JOIN ed_estudiante_tutores et ON et."tutorId" = t.id
       WHERE t."empresaId" = $1
       GROUP BY t.id
       ORDER BY t.apellidos, t.nombres`,
      [-1],
    )).resolves.toEqual([]);
  });
});
