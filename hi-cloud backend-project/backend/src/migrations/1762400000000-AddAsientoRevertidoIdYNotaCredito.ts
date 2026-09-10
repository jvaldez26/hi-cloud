import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Base de reversas contables:
 *
 * - asientoRevertidoId en asientos_contables: vincula un contra-asiento de
 *   reversa con el asiento CONTABILIZADO original que revierte. Usado por
 *   AsientosAutomaticosService.revertirAsiento() para no revertir el mismo
 *   asiento dos veces (idempotencia).
 * - 'nota_credito' en el enum de tipoOrigen: namespace propio para el asiento
 *   de una Nota de Crédito aceptada por DGII, distinto de 'ajuste' (que ya
 *   usan gastos, nómina, mantenimiento y devoluciones, cada uno con su propio
 *   espacio de referenciaId — evita que dos documentos de tablas distintas con
 *   el mismo id numérico colisionen al buscar el asiento a revertir).
 */
export class AddAsientoRevertidoIdYNotaCredito1762400000000 implements MigrationInterface {
  name = 'AddAsientoRevertidoIdYNotaCredito1762400000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "asientos_contables" ADD COLUMN IF NOT EXISTS "asientoRevertidoId" integer`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_asientos_contables_asientoRevertidoId" ON "asientos_contables" ("asientoRevertidoId")`);

    // Intentamos ambos nombres posibles del enum (mismo patrón que
    // 1749910000000-AddAsientosToOrdenProduccion, que agregó 'manufactura').
    await qr.query(`
      DO $$ BEGIN
        BEGIN
          ALTER TYPE asientos_contables_tipoorigen_enum ADD VALUE IF NOT EXISTS 'nota_credito';
        EXCEPTION WHEN undefined_object THEN NULL;
        END;
      END $$;
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS "idx_asientos_contables_asientoRevertidoId"`);
    await qr.query(`ALTER TABLE "asientos_contables" DROP COLUMN IF EXISTS "asientoRevertidoId"`);
    // Postgres no permite quitar un valor de un enum sin recrear el tipo —
    // 'nota_credito' queda en el enum sin uso, igual que otros valores
    // agregados por migraciones anteriores (ver 'manufactura').
  }
}
