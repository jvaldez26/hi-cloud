import { getMetadataArgsStorage } from 'typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { SolicitudVacacion } from '../vacaciones/entities/solicitud-vacacion.entity';
import { NominaPeriodo } from '../nomina/entities/nomina-periodo.entity';
import { NominaLinea } from '../nomina/entities/nomina-linea.entity';

/**
 * Contrato: el SQL crudo de getMisVacaciones() y getMisNominas() debe apuntar
 * a las tablas y columnas REALES, no a nombres escritos a mano.
 *
 * Historia real (2026-09-06): ambos métodos consultaban tablas que nunca
 * existieron —`vacaciones` (real: solicitudes_vacacion) y
 * `periodos_nomina`/`lineas_nomina` (real, en el orden correcto:
 * nomina_periodos/nomina_lineas), esta última además leyendo columnas de la
 * línea con el alias del período. Encontrado en la misma auditoría que
 * `configuracion_sistema` — ver [[project-incidente-rds-2026-09-06]] — mismo
 * patrón: SQL crudo + `.catch(() => [])` silencioso. Efecto: "Mis vacaciones"
 * y "Mis recibos" del portal del empleado mostraban SIEMPRE vacío, para TODOS
 * los empleados, sin que nadie lo notara.
 *
 * Igual que en auth: capa estática (siempre en CI, sin BD, compara contra el
 * nombre real vía @Entity) + capa real gateada por DB_HOST.
 */
describe('SQL crudo de portal-empleado.service.ts — getMisVacaciones y getMisNominas', () => {
  const tabla = (target: Function) =>
    getMetadataArgsStorage().tables.find(t => t.target === target)?.name;

  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');

  it('las tablas reales siguen siendo las esperadas (si esto rompe, revisar los métodos de abajo a mano)', () => {
    expect(tabla(SolicitudVacacion)).toBe('solicitudes_vacacion');
    expect(tabla(NominaPeriodo)).toBe('nomina_periodos');
    expect(tabla(NominaLinea)).toBe('nomina_lineas');
  });

  it('getMisVacaciones() consulta solicitudes_vacacion, no un nombre a mano', () => {
    const src = leer('portal-empleado.service.ts');
    const cuerpo = src.slice(src.indexOf('async getMisVacaciones('));
    const fin = cuerpo.indexOf('async getMisSolicitudes(');
    const bloque = cuerpo.slice(0, fin);

    expect(bloque).toContain(`FROM ${tabla(SolicitudVacacion)}`);
    expect(bloque).not.toMatch(/FROM\s+vacaciones\b/);
    // El bug original también seleccionaba una columna `v.tipo` que no existe
    // en el entity — guarda explícita para que no vuelva al SELECT.
    const select = bloque.slice(bloque.indexOf('SELECT'), bloque.indexOf('FROM'));
    expect(select).not.toMatch(/\btipo\b/);
  });

  it('getMisNominas() consulta nomina_periodos/nomina_lineas, no nombres a mano', () => {
    const src = leer('portal-empleado.service.ts');
    const cuerpo = src.slice(src.indexOf('async getMisNominas('));
    const fin = cuerpo.indexOf('async getMiResumen(');
    const bloque = cuerpo.slice(0, fin);

    expect(bloque).toContain(`FROM ${tabla(NominaPeriodo)} pn`);
    expect(bloque).toContain(`JOIN ${tabla(NominaLinea)} ln`);
    expect(bloque).not.toMatch(/FROM\s+periodos_nomina\b/);
    expect(bloque).not.toMatch(/JOIN\s+lineas_nomina\b/);
    // Las columnas de la línea deben leerse con el alias de la línea, no el
    // del período — la causa concreta de por qué el original nunca pudo
    // funcionar aunque alguien le hubiera arreglado solo el nombre de tabla.
    expect(bloque).toContain('ln."diasTrabajados"');
    expect(bloque).toContain('ln."salarioBruto"');
    expect(bloque).toContain('ln."salarioNeto"');
  });

  it('un fallo al leer vacaciones o nómina se reporta a Sentry, no solo al logger', () => {
    const src = leer('portal-empleado.service.ts');
    const vacaciones = src.slice(src.indexOf('async getMisVacaciones('), src.indexOf('async getMisSolicitudes('));
    const nominas    = src.slice(src.indexOf('async getMisNominas('),    src.indexOf('async getMiResumen('));
    expect(vacaciones).toContain('reportServiceError');
    expect(nominas).toContain('reportServiceError');
  });
});

// ── Verificación real contra Postgres — requiere BD ───────────────────────────
// Solo corre si DB_HOST está configurado; se salta en CI sin BD (mismo patrón
// que encf-generator.service.spec.ts y configuraciones-sistema-sql.spec.ts).
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('portal-empleado — SELECT reales contra Postgres', () => {
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

  it('el SELECT de solicitudes_vacacion no truena (0 filas es una respuesta válida)', async () => {
    await expect(dataSource.query(
      `SELECT "fechaInicio"::text, "fechaFin"::text, "diasSolicitados" AS dias, estado, motivo
       FROM solicitudes_vacacion WHERE "empleadoId" = -1 AND "empresaId" = -1 AND "isActive" = true LIMIT 20`,
    )).resolves.toEqual([]);
  });

  it('el SELECT de nomina_periodos/nomina_lineas no truena (0 filas es una respuesta válida)', async () => {
    await expect(dataSource.query(
      `SELECT pn.id AS "periodoId", ln.id AS "lineaId", pn.periodo, ln."diasTrabajados",
              ln."salarioBruto"::text, ln."tssAfpEmpleado"::text AS "descuentoAfp",
              ln."tssSfsEmpleado"::text AS "descuentoSfs", ln.isr::text AS "descuentoIsr",
              ln."salarioNeto"::text, pn.estado, pn."fechaPago"::text
       FROM nomina_periodos pn JOIN nomina_lineas ln ON ln."periodoId" = pn.id
       WHERE ln."empleadoId" = -1 AND pn."empresaId" = -1 AND pn."isActive" = true
       ORDER BY pn.periodo DESC LIMIT 24`,
    )).resolves.toEqual([]);
  });
});
