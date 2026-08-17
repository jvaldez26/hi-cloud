import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega el valor 'ajuste_costo_importacion' al enum de tipos de movimientos de inventario.
 *
 * Se usa cuando un gasto de importación se aplica retroactivamente a una compra
 * ya recibida: el AVCO del producto se corrige sin mover unidades físicas (cantidad=0).
 *
 * Contexto: los enums en PostgreSQL no se pueden modificar dentro de una transacción
 * (ALTER TYPE ... ADD VALUE no es transaccional). Se usa transaction=false + DO-IF-NOT-EXISTS
 * para hacer la migración idempotente.
 */
export class AddAjusteCostoImportacionMovimiento1755630000000
  implements MigrationInterface
{
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
           WHERE enumtypid = 'movimientos_inventario_tipo_enum'::regtype
             AND enumlabel  = 'ajuste_costo_importacion'
        ) THEN
          ALTER TYPE movimientos_inventario_tipo_enum
            ADD VALUE 'ajuste_costo_importacion';
        END IF;
      END$$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL no soporta DROP VALUE en un enum. Para un rollback real
    // habría que recrear el tipo y migrar la tabla.
  }
}
