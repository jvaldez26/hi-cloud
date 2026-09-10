import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega 'nota_debito' al enum de tipoOrigen de asientos_contables: namespace
 * propio para el asiento que genera notas-debito.service.ts al emitir una ND
 * (E33), evitando colisión con otros tipos que comparten 'ajuste'.
 */
export class AddNotaDebitoTipoOrigenAsiento1762500000000 implements MigrationInterface {
  name = 'AddNotaDebitoTipoOrigenAsiento1762500000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      DO $$ BEGIN
        BEGIN
          ALTER TYPE asientos_contables_tipoorigen_enum ADD VALUE IF NOT EXISTS 'nota_debito';
        EXCEPTION WHEN undefined_object THEN NULL;
        END;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // Postgres no permite quitar un valor de un enum sin recrear el tipo —
    // 'nota_debito' queda en el enum sin uso.
  }
}
