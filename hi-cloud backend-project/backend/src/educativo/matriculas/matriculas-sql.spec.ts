import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';

/**
 * Contrato: create()/update()/stats() de matriculas.service.ts deben usar
 * las columnas reales de ed_matriculas (becaId — FK a ed_becas, no un enum
 * de texto —, descuentoBeca, notas) y, en stats(), el sexo del estudiante
 * (e.sexo vía el JOIN a ed_estudiantes, ya presente en la misma query) —
 * ed_matriculas nunca tuvo columna `sexo`.
 */
describe('SQL crudo de matriculas.service.ts', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');
  const src = () => leer('matriculas.service.ts');
  const bloque = (inicio: string, fin: string) => {
    const s = src();
    return s.slice(s.indexOf(inicio), s.indexOf(fin));
  };

  it('create() usa becaId/descuentoBeca/notas, no tipoBeca/porcentajeBeca/observaciones', () => {
    const b = bloque('async create(', 'async update(');
    expect(b).toContain('"becaId"');
    expect(b).toContain('"descuentoBeca"');
    expect(b).toContain('dto.notas');
    expect(b).not.toContain('tipoBeca');
    expect(b).not.toContain('porcentajeBeca');
    expect(b).not.toContain('dto.observaciones');
    // becaId es FK nullable, no un enum de texto con sentinela por default
    expect(b).not.toContain("dto.becaId ?? 'ninguna'");
  });

  it('update() (FIELDS) usa las mismas columnas reales', () => {
    const b = bloque('async update(', 'async stats(');
    expect(b).toContain("'becaId'");
    expect(b).toContain("'descuentoBeca'");
    expect(b).toContain("'notas'");
    expect(b).not.toContain("'tipoBeca'");
    expect(b).not.toContain("'porcentajeBeca'");
    expect(b).not.toContain("'observaciones'");
  });

  it('stats() lee e.sexo (JOIN a ed_estudiantes), no m.sexo — la columna no existe en ed_matriculas', () => {
    const b = bloque('async stats(', '}\n}');
    expect(b).toContain('e.sexo');
    expect(b).not.toContain('m.sexo');
    expect(b).toContain('m."becaId" IS NOT NULL');
    expect(b).not.toContain("m.\"tipoBeca\" != 'ninguna'");
  });
});

// ── Verificación real contra Postgres — requiere BD ───────────────────────────
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('ed_matriculas — EXPLAIN contra Postgres', () => {
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
      `EXPLAIN INSERT INTO ed_matriculas (
         "empresaId", "estudianteId", "anioEscolarId", "gradoId", "seccionId",
         "fechaMatricula", estado, "becaId", "descuentoBeca", notas
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [-1, -1, -1, -1, null, '2026-01-01', 'activa', null, 0, null],
    )).resolves.toBeDefined();
  });

  it('el SELECT de stats() no truena (0 filas es una respuesta válida)', async () => {
    await expect(dataSource.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE m."becaId" IS NOT NULL)::int AS "conBeca",
         COUNT(*) FILTER (WHERE e.sexo = 'M')::int AS masculinos,
         COUNT(*) FILTER (WHERE e.sexo = 'F')::int AS femeninos
       FROM ed_matriculas m
       JOIN ed_estudiantes e ON e.id = m."estudianteId"
       WHERE m."empresaId" = $1 AND m.estado = 'activa'`,
      [-1],
    )).resolves.toEqual([{ total: 0, conBeca: 0, masculinos: 0, femeninos: 0 }]);
  });
});
