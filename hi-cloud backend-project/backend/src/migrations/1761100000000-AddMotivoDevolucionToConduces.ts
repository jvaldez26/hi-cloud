import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Motivo de devolución en su propia columna.
 *
 * Hasta ahora la devolución escribía en observacionesEntrega, el mismo campo
 * que usa la entrega, así que era imposible saber si una nota era "el cliente
 * firmó y dijo esto" o "esto volvió al almacén por esto otro".
 *
 * Sin backfill a propósito: los tres conduces devueltos que hay en producción
 * tienen observacionesEntrega en null, o sea que no hay ningún motivo viejo que
 * rescatar, y mover datos de un campo a otro con significados distintos habría
 * sido peor que dejar el guion.
 *
 * Idempotente de principio a fin: las columnas con IF NOT EXISTS y la FK con su
 * comprobación previa. Postgres no admite ADD CONSTRAINT IF NOT EXISTS, y sin
 * esa guarda una segunda pasada muere con "constraint already exists" y se
 * lleva el deploy por delante — que es exactamente lo que pasó la primera vez.
 */
export class AddMotivoDevolucionToConduces1761100000000 implements MigrationInterface {
  name = 'AddMotivoDevolucionToConduces1761100000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`
      ALTER TABLE conduces
        ADD COLUMN IF NOT EXISTS "motivoDevolucion" VARCHAR(500) NULL,
        ADD COLUMN IF NOT EXISTS "devueltoPorUsuarioId" INTEGER NULL,
        ADD COLUMN IF NOT EXISTS "fechaDevolucion" TIMESTAMP NULL
    `);

    const yaExiste: unknown[] = await qr.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'FK_conduces_devueltoPorUsuarioId'`,
    );
    if (yaExiste.length === 0) {
      await qr.query(`
        ALTER TABLE conduces
          ADD CONSTRAINT "FK_conduces_devueltoPorUsuarioId"
            FOREIGN KEY ("devueltoPorUsuarioId") REFERENCES users(id) ON DELETE SET NULL
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`SET LOCAL lock_timeout = '3s'`);
    await qr.query(`
      ALTER TABLE conduces
        DROP CONSTRAINT IF EXISTS "FK_conduces_devueltoPorUsuarioId"
    `);
    await qr.query(`
      ALTER TABLE conduces
        DROP COLUMN IF EXISTS "fechaDevolucion",
        DROP COLUMN IF EXISTS "devueltoPorUsuarioId",
        DROP COLUMN IF EXISTS "motivoDevolucion"
    `);
  }
}
