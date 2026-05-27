import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega los campos asientoInicioId y asientoFinId a la tabla ordenes_produccion
 * para vincular los asientos contables generados automáticamente al iniciar
 * y completar una orden de producción.
 */
export class AddAsientosToOrdenProduccion1749910000000 implements MigrationInterface {
  name = 'AddAsientosToOrdenProduccion1749910000000';

  public async up(qr: QueryRunner): Promise<void> {
    // Agregar valor 'manufactura' al enum de tipo origen de asiento (TypeORM lo nombra {tabla}_{columna}_enum)
    // Intentamos ambos nombres posibles para cubrir entornos con sincronización automática
    await qr.query(`
      DO $$ BEGIN
        BEGIN
          ALTER TYPE asientos_contables_tipoorigen_enum ADD VALUE IF NOT EXISTS 'manufactura';
        EXCEPTION WHEN undefined_object THEN NULL;
        END;
      END $$;
    `);

    // Columnas de asiento en órdenes de producción
    await qr.query(`ALTER TABLE "ordenes_produccion" ADD COLUMN IF NOT EXISTS "asientoInicioId" integer`);
    await qr.query(`ALTER TABLE "ordenes_produccion" ADD COLUMN IF NOT EXISTS "asientoFinId" integer`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "ordenes_produccion" DROP COLUMN IF EXISTS "asientoInicioId"`);
    await qr.query(`ALTER TABLE "ordenes_produccion" DROP COLUMN IF EXISTS "asientoFinId"`);
  }
}
