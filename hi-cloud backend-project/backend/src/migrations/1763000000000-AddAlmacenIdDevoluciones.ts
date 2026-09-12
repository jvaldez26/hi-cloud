import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guarda el almacén donde procesar() metió la mercancía al confirmar la
 * recepción — hasta ahora ProcesarDevolucionDto.almacenId llegaba y se
 * usaba para mover el stock, pero nunca se persistía en ningún lado. Sin
 * esto, anular() no tiene forma de saber de qué almacén sacar la reversa
 * cuando la devolución ya está "procesada" (ver anular() en
 * devoluciones.service.ts).
 *
 * Si almacenId queda NULL (el usuario no eligió ninguno al procesar),
 * anular() cae al mismo fallback determinístico que syncStockAlmacen ya
 * usa siempre en ese caso — el almacén activo de menor id de la empresa —
 * así que la reversa sigue siendo simétrica al movimiento original.
 */
export class AddAlmacenIdDevoluciones1763000000000 implements MigrationInterface {
  name = 'AddAlmacenIdDevoluciones1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devoluciones"
        ADD COLUMN IF NOT EXISTS "almacenId" integer NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devoluciones"
        DROP COLUMN IF EXISTS "almacenId"
    `);
  }
}
