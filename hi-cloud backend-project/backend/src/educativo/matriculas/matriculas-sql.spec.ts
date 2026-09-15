import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';

/**
 * Contrato: ed_matriculas.becaId/descuentoBeca se eliminaron (migración
 * 1763400000000-DropBecaFieldsDeEdMatriculas) — eran informativos, sin
 * ningún consumidor real; ed_estudiante_becas es la fuente real de becas
 * (ver becas.service.ts, consultada por colegiatura.service.ts al generar
 * cargos). create()/update() de matriculas.service.ts NO deben volver a
 * escribirlos, y stats() debe calcular "conBeca" contra ed_estudiante_becas,
 * no contra una columna de ed_matriculas.
 *
 * También cubre lo ya sano de antes: stats() lee e.sexo (JOIN a
 * ed_estudiantes), no m.sexo — la columna no existe en ed_matriculas.
 */
describe('SQL crudo de matriculas.service.ts — sin becaId/descuentoBeca', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');
  const src = () => leer('matriculas.service.ts');
  const bloque = (inicio: string, fin: string) => {
    const s = src();
    return s.slice(s.indexOf(inicio), s.indexOf(fin));
  };

  it('create() no escribe becaId ni descuentoBeca', () => {
    const b = bloque('async create(', 'async update(');
    expect(b).not.toContain('becaId');
    expect(b).not.toContain('descuentoBeca');
    expect(b).toContain('dto.notas');
  });

  it('update() (FIELDS) no incluye becaId ni descuentoBeca', () => {
    const b = bloque('async update(', 'async stats(');
    expect(b).not.toContain('becaId');
    expect(b).not.toContain('descuentoBeca');
    expect(b).toContain("'notas'");
  });

  it('stats() calcula "conBeca" contra ed_estudiante_becas, no contra ed_matriculas', () => {
    const b = bloque('async stats(', '}\n}');
    expect(b).toContain('e.sexo');
    expect(b).not.toContain('m.sexo');
    expect(b).toContain('FROM ed_estudiante_becas eb');
    expect(b).toContain('eb."estudianteId" = m."estudianteId"');
    expect(b).toContain('eb."isActive" = true');
    expect(b).not.toContain('m."becaId"');
  });
});

// ── Verificación real contra Postgres — requiere BD ───────────────────────────
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('ed_matriculas — EXPLAIN contra Postgres (sin becaId/descuentoBeca)', () => {
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

  it('el INSERT de create() (sin becaId/descuentoBeca) es válido contra el esquema real (EXPLAIN, no ejecuta)', async () => {
    await expect(dataSource.query(
      `EXPLAIN INSERT INTO ed_matriculas (
         "empresaId", "estudianteId", "anioEscolarId", "gradoId", "seccionId",
         "fechaMatricula", estado, notas
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [-1, -1, -1, -1, null, '2026-01-01', 'activa', null],
    )).resolves.toBeDefined();
  });

  it('el SELECT de stats() (conBeca vía ed_estudiante_becas) no truena (0 filas es una respuesta válida)', async () => {
    await expect(dataSource.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM ed_estudiante_becas eb
           WHERE eb."estudianteId" = m."estudianteId" AND eb."isActive" = true
             AND (eb."anioEscolarId" IS NULL OR eb."anioEscolarId" = m."anioEscolarId")
         ))::int AS "conBeca",
         COUNT(*) FILTER (WHERE e.sexo = 'M')::int AS masculinos,
         COUNT(*) FILTER (WHERE e.sexo = 'F')::int AS femeninos
       FROM ed_matriculas m
       JOIN ed_estudiantes e ON e.id = m."estudianteId"
       WHERE m."empresaId" = $1 AND m.estado = 'activa'`,
      [-1],
    )).resolves.toEqual([{ total: 0, conBeca: 0, masculinos: 0, femeninos: 0 }]);
  });

  it('becaId y descuentoBeca ya no existen como columnas de ed_matriculas', async () => {
    const rows = await dataSource.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'ed_matriculas' AND column_name IN ('becaId', 'descuentoBeca')`,
    );
    expect(rows).toEqual([]);
  });
});
