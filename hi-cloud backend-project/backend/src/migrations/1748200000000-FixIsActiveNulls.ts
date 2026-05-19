import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convierte valores NULL → true en las columnas isActive.
 *
 * Causa del problema: @Column({ default: true }) en TypeORM solo establece
 * el DEFAULT a nivel de entidad, pero los registros creados antes de que se
 * aplicara ese default en PostgreSQL tienen isActive = NULL.
 *
 * El query TypeORM WHERE "isActive" = true NO retorna filas con NULL
 * (en PostgreSQL, NULL = true evalúa a NULL, no TRUE).
 * Por eso mis-empresas devolvía array vacío.
 */
export class FixIsActiveNulls1748200000000 implements MigrationInterface {
  name = 'FixIsActiveNulls1748200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Normalizar todas las tablas con columna isActive
    const tables = [
      'users',
      'empresa',
      'usuario_empresa',
      'sucursales',
      'clientes',
      'productos',
      'proveedores',
      'facturas',
      'compras',
    ];

    for (const table of tables) {
      try {
        await queryRunner.query(
          `UPDATE "${table}" SET "isActive" = true WHERE "isActive" IS NULL`,
        );
      } catch {
        // Ignorar si la tabla no tiene columna isActive
      }
    }

    // Asegurar que las columnas tengan DEFAULT true y NOT NULL en BD
    const criticalTables = ['empresa', 'usuario_empresa'];
    for (const table of criticalTables) {
      try {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "isActive" SET DEFAULT true`,
        );
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "isActive" SET NOT NULL`,
        );
      } catch {
        // Ignorar si ya tiene el constraint
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No revertir — los NULL eran incorrectos de origen
  }
}
