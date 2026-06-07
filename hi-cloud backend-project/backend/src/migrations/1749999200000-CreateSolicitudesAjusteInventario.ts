import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla solicitudes_ajuste_inventario para el flujo de aprobación de ajustes.
 * Idempotente: usa CREATE TABLE IF NOT EXISTS y DO/EXCEPTION para enums.
 */
export class CreateSolicitudesAjusteInventario1749999200000 implements MigrationInterface {
  name = 'CreateSolicitudesAjusteInventario1749999200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "solicitudes_ajuste_inventario_estado_enum"
          AS ENUM('pendiente', 'aprobada', 'rechazada');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "solicitudes_ajuste_inventario" (
        "id"             SERIAL  PRIMARY KEY,
        "isActive"       BOOLEAN NOT NULL DEFAULT true,
        "createdAt"      TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMP NOT NULL DEFAULT now(),
        "empresaId"      INTEGER,
        "productoId"     INTEGER NOT NULL,
        "cantidadNueva"  NUMERIC(12,4) NOT NULL,
        "motivo"         TEXT NOT NULL,
        "estado"         "solicitudes_ajuste_inventario_estado_enum" NOT NULL DEFAULT 'pendiente',
        "userId"         INTEGER NOT NULL,
        "adminId"        INTEGER,
        "motivoRechazo"  TEXT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_solicitudes_ajuste_empresa_estado"
        ON "solicitudes_ajuste_inventario" ("empresaId", "estado")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "solicitudes_ajuste_inventario"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "solicitudes_ajuste_inventario_estado_enum"`);
  }
}
