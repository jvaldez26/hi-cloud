import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prestamista Etapa 2 (resto) §4-§6 — ver docs/prestamista/etapa-2-resto.md.
 *
 * - pr_desembolsos_parciales: tabla nueva (§4) — cada tramo que entrega
 *   efectivo al deudor. pr_prestamos.desembolsado acumula la suma; el
 *   préstamo nace con la tabla de amortización COMPLETA (sobre el monto
 *   total) desde el día uno, solo el efectivo entra en tramos.
 * - pr_prestamos.desembolsado: backfill = montoPrincipal para préstamos
 *   existentes — ya estaban 100% desembolsados antes de que este concepto
 *   existiera, nunca pasan por el estado 'desembolso_parcial'.
 * - pr_cuotas.interesCondonado / moraCondonada (§6): cuánto de
 *   interesPagado/moraPagada vino de una condonación en vez de dinero real
 *   — puramente informativo/auditoría. Las fórmulas de saldo pendiente
 *   (GREATEST(0, interes - interesPagado), etc.) no cambian: condonar
 *   incrementa interesPagado/moraPagada igual que un pago, así el saldo
 *   pendiente baja sin tocar las 3+ queries que ya calculan ese saldo en
 *   todo el módulo.
 */
export class PrestamistaEtapa2RestoP21778000000000 implements MigrationInterface {
  name = 'PrestamistaEtapa2RestoP21778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pr_desembolsos_parciales (
        id SERIAL PRIMARY KEY,
        "empresaId" INTEGER NOT NULL,
        "prestamoId" INTEGER NOT NULL REFERENCES pr_prestamos(id),
        monto DECIMAL(14,2) NOT NULL,
        fecha DATE NOT NULL,
        "metodoPago" VARCHAR(20) NULL,
        notas TEXT NULL,
        "creadoPor" INTEGER NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pr_desembolsos_parciales_prestamo ON pr_desembolsos_parciales("prestamoId")
    `);

    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE pr_prestamos ADD COLUMN IF NOT EXISTS "desembolsado" DECIMAL(14,2) NULL
    `);
    await queryRunner.query(`
      UPDATE pr_prestamos SET "desembolsado" = "montoPrincipal" WHERE "desembolsado" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE pr_prestamos ALTER COLUMN "desembolsado" SET DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE pr_prestamos ALTER COLUMN "desembolsado" SET NOT NULL
    `);

    await queryRunner.query(`SET LOCAL lock_timeout = '3s'`);
    await queryRunner.query(`
      ALTER TABLE pr_cuotas
        ADD COLUMN IF NOT EXISTS "interesCondonado" DECIMAL(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "moraCondonada" DECIMAL(12,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pr_cuotas
        DROP COLUMN IF EXISTS "moraCondonada",
        DROP COLUMN IF EXISTS "interesCondonado"
    `);
    await queryRunner.query(`
      ALTER TABLE pr_prestamos DROP COLUMN IF EXISTS "desembolsado"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS pr_desembolsos_parciales`);
  }
}
