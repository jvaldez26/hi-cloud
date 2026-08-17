import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega el valor 'importacion' al enum de Postgres de asientos_contables.tipoOrigen.
 *
 * ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una transacción en
 * PostgreSQL < 12, así que esta migración corre fuera de transacción.
 * IF NOT EXISTS la hace idempotente (re-ejecución segura).
 */
export class AddImportacionEnum1755620000000 implements MigrationInterface {
  name = 'AddImportacionEnum1755620000000';

  /**
   * Deshabilitar la transacción que TypeORM envolvería automáticamente.
   * Sin esto, ALTER TYPE ADD VALUE falla en Postgres < 12.
   */
  public transaction = false;

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'asientos_contables_tipoorigen_enum'
            AND e.enumlabel = 'importacion'
        ) THEN
          ALTER TYPE asientos_contables_tipoorigen_enum ADD VALUE 'importacion';
        END IF;
      END
      $$;
    `);
  }

  async down(_qr: QueryRunner): Promise<void> {
    // PostgreSQL no permite DROP VALUE de un enum — la reversión es no-op intencional.
    // Para revertir completamente: recrear el enum sin 'importacion' y alterar la tabla.
    // No se hace aquí porque es destructivo y 'importacion' ya no será usado.
  }
}
