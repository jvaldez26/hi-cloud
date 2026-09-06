import { getMetadataArgsStorage } from 'typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { ConfiguracionSistema } from '../configuracion/entities/configuracion-sistema.entity';

/**
 * Contrato: el SQL crudo que lee MAX_INTENTOS_LOGIN y SESION_HORAS debe apuntar
 * a la tabla REAL de ConfiguracionSistema, no a un nombre escrito a mano.
 *
 * Historia real (2026-09-06): auth.service.ts y session-lifetime.service.ts
 * consultaban `configuracion_sistema` (singular). La tabla real es
 * `configuraciones_sistema` (plural, la del @Entity). El SELECT fallaba con
 * "relation does not exist", el catch lo tragaba y caía al default — en
 * silencio, durante meses. Efecto: lo que Jean configurara en Super Admin para
 * MAX_INTENTOS_LOGIN o SESION_HORAS nunca se leía; la plataforma entera corría
 * siempre con 5 intentos / 24 h sin que nadie lo supiera. La carga constante de
 * ese SELECT fallando decenas de veces por minuto (dos por login, más cada
 * rotación de refresh token) también contribuyó a la presión de I/O que
 * terminó en el agotamiento de checkpoints de RDS ese día.
 *
 * Este archivo tiene dos capas:
 *
 *  1. Estática (siempre corre en CI, sin BD): lee el .ts fuente y compara el
 *     nombre de tabla del SQL crudo contra el nombre REAL declarado en
 *     @Entity(...) — no contra un string repetido a mano, que es exactamente
 *     el tipo de duplicación que permitió la deriva original. Si mañana
 *     alguien renombra la tabla en el entity sin tocar estos dos SELECT (o
 *     viceversa), esto rompe en rojo.
 *
 *  2. Real (solo si DB_HOST está configurado): ejecuta los dos SELECT tal
 *     cual están en el código de producción contra una BD real y confirma que
 *     no truenan. Se salta en CI sin BD — igual que
 *     encf-generator.service.spec.ts — así que la capa 1 es la que de verdad
 *     protege el pipeline hoy; la capa 2 es la prueba de que además funcionan.
 */
describe('SQL crudo de configuraciones_sistema — auth.service.ts y session-lifetime.service.ts', () => {
  const tablaReal = () =>
    getMetadataArgsStorage().tables.find(t => t.target === ConfiguracionSistema)?.name;

  it('la tabla real de ConfiguracionSistema sigue siendo configuraciones_sistema', () => {
    // Si esto rompe, es el propio @Entity el que cambió — hay que revisar los
    // dos SELECT de abajo a mano, no solo actualizar este número.
    expect(tablaReal()).toBe('configuraciones_sistema');
  });

  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');

  it('auth.service.ts (MAX_INTENTOS_LOGIN) consulta la tabla real, no un nombre a mano', () => {
    const src = leer('auth.service.ts');
    const cuerpo = src.slice(src.indexOf('async getEffectiveMaxIntentos(empresaId'));
    const fin = cuerpo.indexOf('catch (err)');
    const bloque = cuerpo.slice(0, fin);

    expect(bloque).toContain("clave = 'MAX_INTENTOS_LOGIN'");
    expect(bloque).toContain(`FROM ${tablaReal()}`);
    // Guarda explícita contra el nombre exacto que causó el incidente.
    expect(bloque).not.toMatch(/FROM\s+configuracion_sistema\b/);
  });

  it('session-lifetime.service.ts (SESION_HORAS) consulta la tabla real, no un nombre a mano', () => {
    const src = leer('session-lifetime.service.ts');
    const cuerpo = src.slice(src.indexOf('private async globalHoras()'));
    const fin = cuerpo.indexOf('catch (err)');
    const bloque = cuerpo.slice(0, fin);

    expect(bloque).toContain("clave = 'SESION_HORAS'");
    expect(bloque).toContain(`FROM ${tablaReal()}`);
    expect(bloque).not.toMatch(/FROM\s+configuracion_sistema\b/);
  });

  it('un fallo al leer la config global se reporta a Sentry, no solo al logger', () => {
    // El catch que se traga el error en silencio es lo que hizo esto invisible
    // durante meses. Ambos catch deben reportar — un log que nadie mira no
    // cuenta como aviso.
    for (const archivo of ['auth.service.ts', 'session-lifetime.service.ts']) {
      const src = leer(archivo);
      expect(src).toContain('reportServiceError');
    }
  });
});

// ── Verificación real contra Postgres — requiere BD ───────────────────────────
// Solo corre si DB_HOST está configurado; se salta en CI sin BD (igual que
// ENCFGeneratorService — concurrencia con BD real, en encf-generator.service.spec.ts).
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('configuraciones_sistema — SELECT reales contra Postgres', () => {
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

  it('el SELECT de MAX_INTENTOS_LOGIN no truena y devuelve una fila', async () => {
    const rows = await dataSource.query(
      `SELECT valor FROM configuraciones_sistema WHERE clave = 'MAX_INTENTOS_LOGIN' LIMIT 1`,
    );
    expect(rows.length).toBe(1);
  });

  it('el SELECT de SESION_HORAS no truena y devuelve una fila', async () => {
    const rows = await dataSource.query(
      `SELECT valor FROM configuraciones_sistema WHERE clave = 'SESION_HORAS' LIMIT 1`,
    );
    expect(rows.length).toBe(1);
  });
});
