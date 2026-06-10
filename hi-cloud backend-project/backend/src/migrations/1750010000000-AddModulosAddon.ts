import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModulosAddon1750010000000 implements MigrationInterface {
  name = 'AddModulosAddon1750010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS modulos_addon (
        id              SERIAL PRIMARY KEY,
        codigo          VARCHAR(50) NOT NULL UNIQUE,
        nombre          VARCHAR(100) NOT NULL,
        descripcion     TEXT,
        "isActive"      BOOLEAN NOT NULL DEFAULT true,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS empresa_modulos (
        id                  SERIAL PRIMARY KEY,
        "empresaId"         INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        "moduloCodigo"      VARCHAR(50) NOT NULL REFERENCES modulos_addon(codigo) ON DELETE CASCADE,
        activo              BOOLEAN NOT NULL DEFAULT true,
        "fechaActivacion"   TIMESTAMP NOT NULL DEFAULT NOW(),
        "fechaVencimiento"  TIMESTAMP,
        "activadoPor"       INTEGER REFERENCES users(id),
        notas               TEXT,
        "createdAt"         TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt"         TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_empresa_modulo UNIQUE ("empresaId", "moduloCodigo")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_empresa_modulos_empresa ON empresa_modulos ("empresaId");
      CREATE INDEX IF NOT EXISTS idx_empresa_modulos_activo  ON empresa_modulos ("empresaId", activo);
    `);

    await queryRunner.query(`
      INSERT INTO modulos_addon (codigo, nombre, descripcion)
      VALUES ('optica', 'Módulo Óptica', 'Gestión de pacientes, citas, consultas, recetas ópticas, órdenes de trabajo y reclamaciones ARS')
      ON CONFLICT (codigo) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS empresa_modulos`);
    await queryRunner.query(`DROP TABLE IF EXISTS modulos_addon`);
  }
}
