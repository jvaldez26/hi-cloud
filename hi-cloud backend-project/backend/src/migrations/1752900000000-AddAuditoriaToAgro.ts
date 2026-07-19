import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A2 — Trazabilidad de autoría en el módulo Agro.
 * Añade "creadoPor" / "actualizadoPor" (userId del CLS) a las tablas de
 * operaciones sensibles. Nullable + DEFAULT NULL para no romper filas existentes:
 * las filas viejas quedan con autor NULL y los listados siguen funcionando.
 * Naming camelCase entre comillas (TypeORM sin NamingStrategy) — igual que el resto de ag_*.
 */
export class AddAuditoriaToAgro1752900000000 implements MigrationInterface {
  name = 'AddAuditoriaToAgro1752900000000';

  private readonly tablas = [
    'ag_ciclos',
    'ag_cosechas',
    'ag_animales',
    'ag_eventos_animal',
    'ag_insumos',
    'ag_aplicaciones_insumo',
    'ag_labores',
  ];

  async up(qr: QueryRunner): Promise<void> {
    for (const t of this.tablas) {
      await qr.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS "creadoPor" INTEGER NULL DEFAULT NULL`);
      await qr.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS "actualizadoPor" INTEGER NULL DEFAULT NULL`);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    for (const t of this.tablas) {
      await qr.query(`ALTER TABLE ${t} DROP COLUMN IF EXISTS "creadoPor"`);
      await qr.query(`ALTER TABLE ${t} DROP COLUMN IF EXISTS "actualizadoPor"`);
    }
  }
}
