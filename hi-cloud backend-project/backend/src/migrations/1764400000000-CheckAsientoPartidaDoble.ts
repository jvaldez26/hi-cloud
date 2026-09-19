import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P3 BLOQUE 1 — blindaje del motor de asientos automáticos. La app ya
 * valida partida doble en dos lugares (ContabilidadService.createAsiento()
 * para el camino manual, AsientosAutomaticosService._crearAsientoContabilizado()
 * para el automático, agregado en este mismo bloque) pero un CHECK a nivel
 * de base de datos es la última línea de defensa: ningún camino futuro
 * (una migración de datos, un script de backfill, un INSERT a mano) puede
 * insertar un asiento descuadrado sin que Postgres lo rechace, sin importar
 * qué capa de la aplicación lo genere o si alguna la evita.
 *
 * NOT VALID a propósito: agregar el CHECK a una tabla ya poblada sin esto
 * obligaría a Postgres a escanear TODA la tabla y fallaría la migración
 * completa si un solo asiento histórico ya estuviera descuadrado — y no hay
 * forma de confirmar que no lo hay sin consultar producción primero. Con
 * NOT VALID, el constraint se aplica de inmediato a todo INSERT/UPDATE
 * nuevo (que es lo que este bloque necesita) sin tocar ni validar las filas
 * existentes. Validarlo contra el histórico (`VALIDATE CONSTRAINT`) es un
 * paso separado, deliberadamente fuera de este commit.
 */
export class CheckAsientoPartidaDoble1764400000000 implements MigrationInterface {
  name = 'CheckAsientoPartidaDoble1764400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE asientos_contables
        ADD CONSTRAINT "CHK_asiento_partida_doble"
        CHECK (ABS("totalDebe" - "totalHaber") <= 0.01) NOT VALID
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE asientos_contables
        DROP CONSTRAINT IF EXISTS "CHK_asiento_partida_doble"
    `);
  }
}
