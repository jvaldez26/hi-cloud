import { MigrationInterface, QueryRunner } from 'typeorm';
// Efecto de borde intencional: inicializa Sentry si este proceso (el CLI
// de `typeorm migration:run`, un proceso aparte del arranque normal de
// Nest) todavía no lo hizo — sin este import, reportServiceError() de
// abajo sería un no-op silencioso por falta de cliente de Sentry.
import '../instrument';
import { reportServiceError } from '../common/observability/sentry';

/**
 * Agrega NOT NULL a cierres_caja.sucursalId — SOLO si, en el momento de
 * correr, no queda ninguna fila en NULL. Debe ir DESPUÉS de
 * FixSucursalIdGeneral (timestamp 1770100000000), que corrige las filas
 * de empresas con una sola sucursal.
 *
 * Verificado por conteo de SOLO LECTURA en producción (2026-10-04): tras
 * esa corrección, cero filas NULL en cierres_caja en TODO el sistema (ni
 * siquiera en empresas con 0 o 2+ sucursales — nunca tuvieron cajas con
 * sucursalId NULL). abrirCaja() además ya rechaza con 400 si no hay
 * sucursal válida en el CLS (ver caja.service.ts), así que no debería
 * volver a entrar una fila NULL por ese camino.
 *
 * Igual se revisa en tiempo de ejecución en vez de asumir el conteo de
 * hoy: si para cuando esto se despliega aparecieron filas NULL nuevas (por
 * ejemplo, un camino distinto que aún no se haya cubierto), la migración
 * NO rompe el deploy — se salta la restricción, pero el salto NUNCA es
 * silencioso: console.error (no warn — debe destacar en el log del
 * deploy) + aviso a Sentry, para que alguien lo note y lo revise.
 */
export class AddNotNullSucursalIdCierresCaja1770110000000 implements MigrationInterface {
  name = 'AddNotNullSucursalIdCierresCaja1770110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ nulas }] = await queryRunner.query(
      `SELECT COUNT(*)::int AS nulas FROM cierres_caja WHERE "sucursalId" IS NULL`,
    );
    if (nulas > 0) {
      const mensaje =
        `[AddNotNullSucursalIdCierresCaja] Quedan ${nulas} fila(s) con sucursalId NULL en cierres_caja — ` +
        `NO se agregó la restricción NOT NULL. Requiere revisión manual.`;
      console.error(mensaje);
      reportServiceError(new Error(mensaje), 'migration.AddNotNullSucursalIdCierresCaja', { nulas });
      return;
    }
    await queryRunner.query(`ALTER TABLE cierres_caja ALTER COLUMN "sucursalId" SET NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE cierres_caja ALTER COLUMN "sucursalId" DROP NOT NULL`);
  }
}
