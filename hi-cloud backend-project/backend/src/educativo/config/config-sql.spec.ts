import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';

/**
 * Contrato: upsertConfig() debe escribir en las columnas REALES de ed_config
 * (configuración académica: nombreCentro, codigoMinerd, escalas, periodos,
 * moneda) — no en el diseño que el código asumía antes (branding
 * institucional: nombreInstitucion, director, logoUrl, colores), que nunca
 * existió en la tabla y hacía que cada intento de configurar el módulo
 * reventara con 42703 (undefined column).
 *
 * Mismo patrón de dos capas que configuraciones-sistema-sql.spec.ts:
 *  1. Estática (siempre en CI, sin BD): el SQL crudo debe usar las columnas
 *     reales y no las viejas.
 *  2. Real (solo si DB_HOST está configurado): EXPLAIN del INSERT — valida
 *     que Postgres acepta la sentencia (tablas/columnas/ON CONFLICT reales)
 *     sin llegar a ejecutarla ni escribir una sola fila.
 */
describe('SQL crudo de config.service.ts — upsertConfig()', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');

  const cuerpo = () => {
    const src = leer('config.service.ts');
    const inicio = src.indexOf('async upsertConfig(');
    const fin = src.indexOf('// ── Años escolares');
    return src.slice(inicio, fin);
  };

  it('usa las 12 columnas reales de ed_config', () => {
    const bloque = cuerpo();
    for (const col of [
      'nombreCentro', 'codigoMinerd', 'regional', 'distritoEducativo',
      'escalaMinima', 'escalaMaxima', 'notaMinimaAprobar', 'usaLetras',
      'escalaLetras', 'cantidadPeriodos', 'tipoPeriodo', 'monedaColegiatura',
    ]) {
      expect(bloque).toContain(col);
    }
  });

  it('no vuelve a usar el diseño de branding institucional que nunca existió en la tabla', () => {
    const bloque = cuerpo();
    for (const col of [
      'nombreInstitucion', 'siglas', 'logoUrl', 'nivelEducativo', 'director',
      'vicedirector', 'secretaria', 'sitioWeb', 'colorPrimario', 'colorSecundario',
    ]) {
      expect(bloque).not.toContain(col);
    }
  });

  it('serializa escalaLetras a JSON explícitamente antes de enviarlo (jsonb, no ARRAY de Postgres)', () => {
    expect(cuerpo()).toContain('JSON.stringify(dto.escalaLetras)');
  });
});

// ── Verificación real contra Postgres — requiere BD ───────────────────────────
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('ed_config — EXPLAIN del INSERT real contra Postgres', () => {
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

  it('el INSERT/ON CONFLICT de upsertConfig() es válido contra el esquema real (EXPLAIN, no ejecuta)', async () => {
    // EXPLAIN planea la sentencia (valida tablas/columnas/constraint del ON
    // CONFLICT) sin escribir nada — cero riesgo aunque esto corra contra una
    // base compartida.
    await expect(dataSource.query(
      `EXPLAIN INSERT INTO ed_config (
         "empresaId", "nombreCentro", "codigoMinerd", regional, "distritoEducativo",
         "escalaMinima", "escalaMaxima", "notaMinimaAprobar", "usaLetras", "escalaLetras",
         "cantidadPeriodos", "tipoPeriodo", "monedaColegiatura"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT ("empresaId") DO UPDATE SET
         "nombreCentro"       = EXCLUDED."nombreCentro",
         "codigoMinerd"       = EXCLUDED."codigoMinerd",
         regional             = EXCLUDED.regional,
         "distritoEducativo"  = EXCLUDED."distritoEducativo",
         "escalaMinima"       = EXCLUDED."escalaMinima",
         "escalaMaxima"       = EXCLUDED."escalaMaxima",
         "notaMinimaAprobar"  = EXCLUDED."notaMinimaAprobar",
         "usaLetras"          = EXCLUDED."usaLetras",
         "escalaLetras"       = EXCLUDED."escalaLetras",
         "cantidadPeriodos"   = EXCLUDED."cantidadPeriodos",
         "tipoPeriodo"        = EXCLUDED."tipoPeriodo",
         "monedaColegiatura"  = EXCLUDED."monedaColegiatura"`,
      [-1, 'Centro de prueba', null, null, null, 0, 100, 70, false, JSON.stringify([]), 4, 'trimestre', 'DOP'],
    )).resolves.toBeDefined();
  });
});
