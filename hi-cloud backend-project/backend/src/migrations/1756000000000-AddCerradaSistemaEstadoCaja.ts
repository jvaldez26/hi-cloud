import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega el valor 'cerrada_por_sistema' al enum de estado en cierres_caja.
 *
 * Este estado es para cajas huérfanas (abiertas y nunca cerradas por el cajero)
 * que se marcan administrativamente sin calcular diferencia ni imputar faltante.
 * Las cajas en este estado quedan excluidas de los reportes de descuadre.
 *
 * IMPORTANTE: esta migración solo agrega el valor al enum de Postgres.
 * La actualización masiva de los registros huérfanos existentes se hace con
 * el script de depuración que debe ejecutarse manualmente tras revisar el respaldo.
 */
export class AddCerradaSistemaEstadoCaja1756000000000 implements MigrationInterface {
  name = 'AddCerradaSistemaEstadoCaja1756000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres no permite ADD VALUE dentro de una transacción activa,
    // pero TypeORM siempre abre una. Usamos el escape hatch para esta DDL específica.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname ILIKE '%cierres_caja%estado%'
            AND e.enumlabel = 'cerrada_por_sistema'
        ) THEN
          -- La búsqueda por nombre del tipo puede variar según cómo TypeORM lo nombró.
          -- Buscamos directamente el tipo del enum de la columna.
          ALTER TYPE cierres_caja_estado_enum ADD VALUE 'cerrada_por_sistema';
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres no permite DROP VALUE de un enum; el rollback requiere reconstruir el tipo.
    // En la práctica este down solo es necesario si se revierte todo el schema.
    // Se deja vacío intencionalmente — el valor 'cerrada_por_sistema' es inofensivo si no se usa.
  }
}
