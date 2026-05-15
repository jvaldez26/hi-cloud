import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración BASELINE — marca el estado actual de producción como punto de partida.
 *
 * Esta migración NO hace cambios en la BD porque todas las tablas ya existen.
 * Se aplica en producción con: INSERT en typeorm_migrations (sin ejecutar SQL).
 *
 * A partir de aquí, CADA cambio de entidad genera su propia migración con:
 *   npm run migration:generate -- src/migrations/NombreDescriptivo
 */
export class Baseline1747360000000 implements MigrationInterface {
  name = 'Baseline1747360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Sin cambios — esquema ya existe en producción desde antes de este sistema de migraciones.
    // Las tablas fueron creadas directamente con TypeORM o SQL manual.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Sin rollback — esta migración es solo un marcador de punto de partida.
  }
}
