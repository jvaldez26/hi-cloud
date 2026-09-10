import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega 'nota_credito_compra' al enum de tipoOrigen de asientos_contables:
 * namespace propio para el asiento que genera notas-credito-compras.service.ts
 * al recibir una NC de compra (devolución a proveedor).
 */
export class AddNotaCreditoCompraTipoOrigenAsiento1762600000000 implements MigrationInterface {
  name = 'AddNotaCreditoCompraTipoOrigenAsiento1762600000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      DO $$ BEGIN
        BEGIN
          ALTER TYPE asientos_contables_tipoorigen_enum ADD VALUE IF NOT EXISTS 'nota_credito_compra';
        EXCEPTION WHEN undefined_object THEN NULL;
        END;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // Postgres no permite quitar un valor de un enum sin recrear el tipo —
    // 'nota_credito_compra' queda en el enum sin uso.
  }
}
