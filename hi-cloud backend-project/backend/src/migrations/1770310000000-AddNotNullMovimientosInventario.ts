import { MigrationInterface, QueryRunner } from 'typeorm';
// Mismo efecto de borde que AddNotNullSucursalIdCierresCaja: inicializa
// Sentry si este proceso (CLI de `typeorm migration:run`) todavía no lo
// hizo, para que reportServiceError() de abajo no sea un no-op silencioso.
import '../instrument';
import { reportServiceError } from '../common/observability/sentry';

/**
 * Agrega NOT NULL a movimientos_inventario.empresaId Y almacenId — cada
 * columna SOLO si, al momento de correr, no queda ninguna fila en NULL
 * para ESA columna. Debe ir DESPUÉS de FixAlmacenIdMovimientosInventario
 * (timestamp 1770300000000).
 *
 * A diferencia de la migración equivalente de cierres_caja, aquí SÍ se
 * espera que quede un resto conocido: el movimiento #214 (producto de la
 * empresa 2, que tiene 2 almacenes activos — sin uno único que asignarle
 * sin adivinar, ver la migración anterior) seguirá con empresaId/
 * almacenId NULL hasta que alguien decida manualmente cuál almacén le
 * corresponde. Por eso esta migración NUNCA rompe el deploy si encuentra
 * NULLs — pero tampoco lo oculta: console.error + aviso a Sentry por cada
 * columna que no pudo quedar NOT NULL.
 */
export class AddNotNullMovimientosInventario1770310000000 implements MigrationInterface {
  name = 'AddNotNullMovimientosInventario1770310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const columna of ['empresaId', 'almacenId'] as const) {
      const [{ nulas }] = await queryRunner.query(
        `SELECT COUNT(*)::int AS nulas FROM movimientos_inventario WHERE "${columna}" IS NULL`,
      );
      if (nulas > 0) {
        const mensaje =
          `[AddNotNullMovimientosInventario] Quedan ${nulas} fila(s) con ${columna} NULL en ` +
          `movimientos_inventario — NO se agregó la restricción NOT NULL para esa columna. Requiere revisión manual.`;
        console.error(mensaje);
        reportServiceError(new Error(mensaje), 'migration.AddNotNullMovimientosInventario', { columna, nulas });
        continue;
      }
      await queryRunner.query(`ALTER TABLE movimientos_inventario ALTER COLUMN "${columna}" SET NOT NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE movimientos_inventario ALTER COLUMN "empresaId" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE movimientos_inventario ALTER COLUMN "almacenId" DROP NOT NULL`);
  }
}
