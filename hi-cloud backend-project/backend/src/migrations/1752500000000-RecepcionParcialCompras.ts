import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecepcionParcialCompras1752500000000 implements MigrationInterface {
  name = 'RecepcionParcialCompras1752500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Agregar valor 'recibida_parcial' al enum de estado de compras
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE compras_estado_enum ADD VALUE IF NOT EXISTS 'recibida_parcial' AFTER 'recibida';
      EXCEPTION WHEN others THEN NULL; END $$;
    `);

    // Agregar columna cantidadRecibida a compra_detalles (null = aún no recibido)
    await queryRunner.query(`
      ALTER TABLE compra_detalles
        ADD COLUMN IF NOT EXISTS "cantidadRecibida" numeric(12,4) NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE compra_detalles DROP COLUMN IF EXISTS "cantidadRecibida";
    `);
  }
}
