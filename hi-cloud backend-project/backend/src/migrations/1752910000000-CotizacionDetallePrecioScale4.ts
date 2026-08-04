import { MigrationInterface, QueryRunner } from 'typeorm';

export class CotizacionDetallePrecioScale41752910000000 implements MigrationInterface {
  name = 'CotizacionDetallePrecioScale41752910000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cotizacion_detalles ALTER COLUMN "precioUnitario" TYPE DECIMAL(12,4)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cotizacion_detalles ALTER COLUMN "precioUnitario" TYPE DECIMAL(12,2)`,
    );
  }
}
