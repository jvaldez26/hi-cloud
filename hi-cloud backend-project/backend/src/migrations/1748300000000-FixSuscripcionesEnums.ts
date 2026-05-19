import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Añade los valores 'emprendedor','pyme','pro','plus' a suscripciones_plan_enum
 * y 'prueba' a suscripciones_estado_enum sin usar DO blocks.
 *
 * El onModuleInit en suscripciones.service.ts usa un DO block que no puede
 * ejecutar ALTER TYPE ADD VALUE en versiones antiguas de PostgreSQL o bajo
 * ciertos contextos de transacción.
 *
 * transaction = false: ALTER TYPE ADD VALUE no puede correr dentro de una
 * transacción en PostgreSQL.
 */
export class FixSuscripcionesEnums1748300000000 implements MigrationInterface {
  name = 'FixSuscripcionesEnums1748300000000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Plan enum
    for (const val of ['emprendedor', 'pyme', 'pro', 'plus']) {
      await queryRunner.query(
        `ALTER TYPE suscripciones_plan_enum ADD VALUE IF NOT EXISTS '${val}'`,
      ).catch(() => null);
    }

    // Estado enum
    await queryRunner.query(
      `ALTER TYPE suscripciones_estado_enum ADD VALUE IF NOT EXISTS 'prueba'`,
    ).catch(() => null);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No se puede revertir ADD VALUE en PostgreSQL sin recrear el tipo
  }
}
